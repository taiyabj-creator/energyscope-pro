/**
 * Android/Web Push subscription client.
 *
 * Chain: Notification permission -> service worker registration ->
 * PushManager.subscribe(VAPID public key from backend) -> POST to backend.
 *
 * Every stage reports a SPECIFIC failure reason instead of collapsing into
 * "Blocked": permission-denied / permission-dismissed / sw-unavailable /
 * vapid-key-invalid / subscribe-failed / backend-error. Diagnostics are
 * logged with safe fields only (stage names, error names, endpoint ORIGIN -
 * never full endpoints or key material).
 *
 * Uses the existing authenticated apiRequest; the VAPID private key never
 * reaches the frontend. Reuses an existing PushSubscription so repeated
 * enable calls (and logout/login cycles) never create duplicate endpoints.
 */

import { apiRequest } from "@/api/client";

const SW_READY_TIMEOUT_MS = 8000;
// First-visit installs precache the full app bundle (~9 MB); allow enough
// time for a known installing/waiting worker to finish activating.
const SW_ACTIVATION_TIMEOUT_MS = 20000;

function logDiagnostics(stage: string, detail?: unknown): void {
  const extra =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}`
      : typeof detail === "string"
        ? detail
        : "";
  console.warn(`[push] ${stage}${extra ? ` - ${extra}` : ""}`);
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** A P-256 applicationServerKey must decode to exactly 65 uncompressed bytes. */
export function isValidVapidPublicKey(base64String: string): boolean {
  try {
    return urlBase64ToUint8Array(base64String).length === 65;
  } catch {
    return false;
  }
}

export type PushSupport = {
  supported: boolean;
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | "unsupported";
};

export function getPushSupport(): PushSupport {
  const secureContext = typeof window !== "undefined" ? window.isSecureContext === true : false;
  const hasNotification = typeof window !== "undefined" && "Notification" in window;
  const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const hasPushManager = typeof window !== "undefined" && "PushManager" in window;

  const supported = secureContext && hasNotification && hasServiceWorker && hasPushManager;
  return {
    supported,
    secureContext,
    hasServiceWorker,
    hasPushManager,
    permission: hasNotification ? Notification.permission : "unsupported",
  };
}

/**
 * Wait until `reg`'s installing/waiting worker reaches "activated" (bounded).
 * Resolves with the registration once active; rejects on redundant workers
 * (install failure) or timeout.
 */
function waitForActivation(
  reg: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<ServiceWorkerRegistration> {
  const worker = reg.installing ?? reg.waiting;
  if (!worker || reg.active) return Promise.resolve(reg);

  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") {
        cleanup();
        resolve(reg);
      } else if (worker.state === "redundant") {
        cleanup();
        reject(
          Object.assign(new Error("Service worker install failed (redundant)"), {
            code: "sw-unavailable",
          }),
        );
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onStateChange);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Object.assign(new Error("Service worker did not activate in time"), {
          code: "sw-unavailable",
        }),
      );
    }, timeoutMs);

    worker.addEventListener("statechange", onStateChange);
  });
}

/**
 * Resolve the controlling service worker registration without the risk of
 * `navigator.serviceWorker.ready` hanging forever on a stuck install
 * (observed on Android Chrome after earlier broken deployments).
 *
 * Order of preference:
 *   1. a registration with an ACTIVE worker (or waiting + page controlled)
 *   2. a registration whose worker is installing/waiting -> await its
 *      activation explicitly (bounded ~20s) so first-visit installs succeed
 *   3. bounded global `ready` race as the last resort
 */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw Object.assign(new Error("Service workers unsupported"), { code: "sw-unavailable" });
  }

  let registrations: readonly ServiceWorkerRegistration[] = [];
  try {
    registrations = await navigator.serviceWorker.getRegistrations();
  } catch (err) {
    logDiagnostics("service-worker getRegistrations failed", err);
  }

  const activeOrWaiting = registrations.find(
    (r) => r.active || (r.waiting && navigator.serviceWorker.controller),
  );
  if (activeOrWaiting) return activeOrWaiting;

  // A registration exists but its worker is still installing/waiting: wait
  // for THAT worker to activate instead of failing after the short global
  // ready timeout (first-visit installs can take longer than SW_READY_TIMEOUT_MS).
  const activating = registrations.find((r) => r.installing || r.waiting);
  if (activating) {
    try {
      const reg = await waitForActivation(activating, SW_ACTIVATION_TIMEOUT_MS);
      logDiagnostics("service worker activated", activating.scope);
      return reg;
    } catch (err) {
      logDiagnostics("service-worker activation wait failed", err);
      // Fall through to the bounded global ready race below.
    }
  }

  // Nothing usable yet -> wait for ready, but bounded so the UI can recover.
  const readyPromise = navigator.serviceWorker.ready as Promise<ServiceWorkerRegistration>;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          Object.assign(new Error("Service worker did not become ready in time"), {
            code: "sw-unavailable",
          }),
        ),
      SW_READY_TIMEOUT_MS,
    ),
  );
  try {
    return await Promise.race([readyPromise, timeout]);
  } catch (err) {
    logDiagnostics("service-worker not ready", err);
    throw Object.assign(new Error("Service worker unavailable"), { code: "sw-unavailable" });
  }
}

/** Current push subscription, if any. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!getPushSupport().supported) return null;
  try {
    const reg = await getRegistration();
    return await reg.pushManager.getSubscription();
  } catch (err) {
    logDiagnostics("getExistingSubscription failed", err);
    return null;
  }
}

/**
 * Request notification permission. MUST be called synchronously from a user
 * gesture handler (Android Chrome requirement). Never call this when
 * permission is already "denied".
 */
export async function requestPushPermission(): Promise<"granted" | "denied" | "dismissed"> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "denied") return "denied";

  try {
    const result = await Notification.requestPermission();
    logDiagnostics(`permission prompt resolved: ${result}`);
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "dismissed";
  } catch (err) {
    logDiagnostics("permission prompt threw", err);
    return "denied";
  }
}

export type EnableResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported"
        | "insecure-context"
        | "permission-denied"
        | "permission-dismissed"
        | "sw-unavailable"
        | "vapid-key-invalid"
        | "vapid-key-fetch-failed"
        | "subscribe-failed"
        | "backend-error";
      detail?: string;
    };

/**
 * Subscribe THIS browser and register the subscription with the backend.
 * Assumes permission is already granted (call requestPushPermission() from
 * the gesture first). Idempotent: reuses the existing subscription endpoint
 * and re-posts it so logout/login never duplicates server rows.
 */
export async function ensurePushSubscription(): Promise<EnableResult> {
  const support = getPushSupport();

  if (support.permission === "unsupported" || !support.supported) {
    if (!support.secureContext) {
      logDiagnostics("blocked: insecure context");
      return { ok: false, reason: "insecure-context" };
    }
    logDiagnostics("blocked: unsupported APIs", JSON.stringify(support));
    return { ok: false, reason: "unsupported" };
  }

  if (Notification.permission !== "granted") {
    const reason =
      Notification.permission === "denied" ? "permission-denied" : "permission-dismissed";
    logDiagnostics(`aborting subscribe, permission=${Notification.permission}`);
    return { ok: false, reason };
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await getRegistration();
  } catch {
    return { ok: false, reason: "sw-unavailable" };
  }
  logDiagnostics("service worker ready", reg.scope);

  const existing = await reg.pushManager.getSubscription();

  let vapidKeyResponse: { publicKey: string };
  try {
    vapidKeyResponse = await apiRequest<{ publicKey: string }>("/notifications/vapid-public");
  } catch (err) {
    logDiagnostics("vapid-public fetch failed", err);
    return { ok: false, reason: "vapid-key-fetch-failed", detail: String(err) };
  }

  if (!isValidVapidPublicKey(vapidKeyResponse.publicKey)) {
    logDiagnostics("server returned malformed VAPID public key");
    return { ok: false, reason: "vapid-key-invalid" };
  }

  let subscription: PushSubscription;
  if (existing) {
    subscription = existing;
    logDiagnostics("reusing existing push subscription");
  } else {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKeyResponse.publicKey),
      });
    } catch (err) {
      logDiagnostics("pushManager.subscribe failed", err);
      return {
        ok: false,
        reason: "subscribe-failed",
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  try {
    const origin = new URL(subscription.endpoint).origin;
    logDiagnostics("posting subscription to backend", origin);
    await apiRequest("/notifications/subscribe", {
      method: "POST",
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });
  } catch (err) {
    logDiagnostics("backend subscribe failed", err);
    return { ok: false, reason: "backend-error", detail: String(err) };
  }

  return { ok: true };
}

/** Remove this device's subscription locally AND server-side. */
export async function disablePushNotifications(): Promise<void> {
  const existing = await getExistingSubscription();
  if (existing) {
    try {
      await apiRequest("/notifications/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: existing.endpoint }),
      });
    } catch (err) {
      // Backend may already have pruned it; continue with local unsubscribe.
      logDiagnostics("backend unsubscribe failed (continuing)", err);
    }
    await existing.unsubscribe();
  }
}

export async function fetchNotificationStatus(): Promise<{
  configured: boolean;
  subscribed: number;
}> {
  return apiRequest<{ success: boolean; configured: boolean; subscribed: number }>(
    "/notifications/status",
  );
}
