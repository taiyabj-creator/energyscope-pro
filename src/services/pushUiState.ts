/**
 * Pure state resolution for the Browser Notifications settings card.
 *
 * Zero imports on purpose: this encodes the Android-Chrome-aware permission
 * matrix as data so it can be unit-tested outside a browser and reused by
 * the Settings UI without duplicating rules.
 *
 * States required by spec:
 *   unsupported        - Notification/SW/PushManager missing or insecure context
 *   default            - never asked ("Not enabled", Enable button)
 *   denied             - Chrome has permanently blocked ("Blocked" + site-settings steps)
 *   granted-no-sub     - allowed but no local push subscription ("Not subscribed", retry)
 *   enabled            - granted + local subscription present ("Enabled", Disable)
 */

export type PushPermission = "granted" | "denied" | "default";

export type PushUiInput = {
  supported: boolean;
  secureContext?: boolean;
  permission: PushPermission;
  /** A PushSubscription exists in this browser's service worker registration. */
  hasLocalSubscription: boolean;
  /** Rows stored for this account server-side (null = unknown / fetch failed). */
  serverCount: number | null;
};

export type PushUiState = {
  statusKey: "unsupported" | "default" | "denied" | "not-subscribed" | "enabled";
  title: string;
  hint?: string;
  /** Step-by-step recovery instructions (rendered prominently when present). */
  instructions?: string;
  showEnable: boolean;
  showDisable: boolean;
};

export const BLOCKED_HELP =
  "Chrome has blocked notifications for this site. To allow them on Android Chrome: tap the lock icon next to the address bar → Permissions → Notifications → Allow (or Chrome ⋮ → Settings → Site settings → Notifications → this site → Allow), then reload this page.";

export function resolvePushUiState(input: PushUiInput): PushUiState {
  if (!input.supported || input.secureContext === false) {
    return {
      statusKey: "unsupported",
      title: "Not supported on this device",
      hint: "Push notifications need an HTTPS site and a browser with service worker support.",
      showEnable: false,
      showDisable: false,
    };
  }

  if (input.permission === "denied") {
    // Never re-prompt; JS cannot reopen a permanently denied permission.
    return {
      statusKey: "denied",
      title: "Blocked",
      instructions: BLOCKED_HELP,
      showEnable: false,
      showDisable: false,
    };
  }

  if (input.permission === "granted") {
    if (input.hasLocalSubscription) {
      // Enabled = THIS browser already holds a push subscription. Enable and
      // Disable are mutually exclusive and driven solely by the local
      // subscription, never by the account-wide server count (which counts
      // every device signed in under the same email and is not this browser).
      return {
        statusKey: "enabled",
        title: "Enabled",
        hint: "Inverter online/offline alerts and the daily production summary are delivered even when the app is closed.",
        showEnable: false,
        showDisable: true,
      };
    }
    return {
      statusKey: "not-subscribed",
      title: "Not subscribed",
      hint: "Notifications are allowed, but this device has no active push subscription yet.",
      showEnable: true,
      showDisable: false,
    };
  }

  return {
    statusKey: "default",
    title: "Not enabled",
    hint: "Allow notifications to receive inverter alerts and the daily production summary.",
    showEnable: true,
    showDisable: false,
  };
}
