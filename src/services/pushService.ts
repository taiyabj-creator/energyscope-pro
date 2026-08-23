/**
 * Android/Web Push subscription client.
 *
 * Chain: Notification permission -> service worker registration ->
 * PushManager.subscribe(VAPID public key from backend) -> POST to backend.
 *
 * Uses the existing authenticated apiRequest; the VAPID private key never
 * reaches the frontend. Handles re-subscription when the browser returns a
 * new endpoint or an older registration went missing.
 */

import { apiRequest } from "@/api/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupport = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
};

export function getPushSupport(): PushSupport {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { supported: false, permission: "unsupported" };
  }
  return { supported: true, permission: Notification.permission };
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0 && import.meta.env.DEV) {
    throw new Error("No service worker in dev mode - test push on a production build.");
  }
  return navigator.serviceWorker.ready;
}

/** Current push subscription, if any. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!getPushSupport().supported) return null;
  try {
    const reg = await getRegistration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Ensure permission + subscription + backend registration.
 * Safe to call repeatedly: reuses the existing subscription endpoint and
 * re-posts it so the backend stays in sync (handles expiry/replacement).
 */
export async function enablePushNotifications(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const support = getPushSupport();
  if (!support.supported) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: `permission:${permission}` };

  const { publicKey } = await apiRequest<{ publicKey: string }>("/notifications/vapid-public");

  const reg = await getRegistration();
  const existing = await reg.pushManager.getSubscription();

  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  // Keep backend authoritative; idempotent per endpoint.
  await apiRequest("/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

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
    } catch {
      // Backend may already have pruned it; continue with local unsubscribe.
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
