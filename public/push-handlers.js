/*
 * EnergyScope Web Push handlers.
 *
 * This file is loaded INSIDE the generated Workbox service worker via
 * `workbox.importScripts` (vite.config.ts). It adds real Android Web Push
 * support without changing the precache/build strategy.
 *
 * Payload contract (JSON, sent by backend/services/pushService.js):
 *   { kind, title, body, url }
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "EnergyScope", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "EnergyScope";
  const options = {
    body: payload.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: payload.kind || "energyscope",
    renotify: false,
    data: { url: payload.url || "/" },
  };

  // Daily summaries use a per-day tag so re-sends collapse instead of stacking;
  // inverter alerts use their kind so ONLINE replaces any stale OFFLINE notice
  // on the same device rather than piling up.
  if (payload.kind === "daily_summary") {
    try {
      const ist = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      options.tag = `daily_summary_${ist}`;
      options.renotify = false;
    } catch {
      /* keep default tag */
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === target && "focus" in client) {
            return client.focus();
          }
        } catch {
          /* ignore malformed client urls */
        }
      }
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* navigation unsupported; focused app is enough */
            }
          }
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
