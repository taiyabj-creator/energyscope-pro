/**
 * EnergyScope Web Push service.
 *
 * Responsibilities:
 *  - store/update/remove push subscriptions tied to the authenticated email
 *  - deliver JSON payloads to every stored subscription via web-push
 *  - prune ONLY subscriptions the push provider reports as gone
 *    (404/410). Transient failures (timeouts, 429, 5xx) are kept and
 *    retried on future notifications; one bad subscription never causes
 *    removal of others.
 *
 * SECURITY:
 *  - VAPID keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 *    VAPID_SUBJECT). The private key is never logged.
 *  - Subscription endpoints embed capability secrets: they are NEVER logged,
 *    not even truncated. Failures are reported by row id + status code only.
 */

const db = require("../data/notificationDatabase");

function getWebPush(deps = {}) {
  if (deps.webPush) return deps.webPush;
  const webPush = require("web-push");
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    throw new Error(
      "Push not configured: missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY."
    );
  }
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    pub,
    priv
  );
  return webPush;
}

/** Upsert a subscription for an authenticated user. Idempotent per endpoint. */
function saveSubscription(email, subscription, deps = {}) {
  const store = deps.db || db;
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    throw new Error("Invalid push subscription payload.");
  }
  store
    .prepare(
      `INSERT INTO push_subscriptions (email, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         email = excluded.email,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = excluded.updated_at,
         failure_count = 0`
    )
    .run(
      String(email),
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      Date.now(),
      Date.now()
    );
}

function removeSubscription(endpoint, deps = {}) {
  (deps.db || db).prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(String(endpoint));
}

function removeSubscriptionsForEmail(email, deps = {}) {
  (deps.db || db).prepare("DELETE FROM push_subscriptions WHERE email = ?").run(String(email));
}

function countForEmail(email, deps = {}) {
  return (deps.db || db)
    .prepare("SELECT COUNT(*) AS c FROM push_subscriptions WHERE email = ?")
    .get(String(email)).c;
}

/**
 * Send a JSON payload to every stored subscription. Returns {sent, pruned, deferred}.
 */
async function broadcast(payload, deps = {}) {
  const store = deps.db || db;
  const sender =
    deps.sendNotification ||
    ((sub, json) => getWebPush(deps).sendNotification(sub, json));
  const rows = store
    .prepare("SELECT id, email, endpoint, p256dh, auth FROM push_subscriptions ORDER BY id")
    .all();
  const raw = JSON.stringify(payload);

  let sent = 0;
  let pruned = 0;
  let deferred = 0;

  for (const row of rows) {
    try {
      await sender(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        raw
      );
      sent++;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired/revoked upstream - remove exactly this row.
        store.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
        pruned++;
      } else {
        // Network hiccup / rate limit / provider 5xx: keep for retry.
        store
          .prepare("UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?")
          .run(row.id);
        deferred++;
        console.log(`[PUSH] Delivery deferred for push row #${row.id} (status ${statusCode ?? "n/a"}).`);
      }
    }
  }

  console.log(`[PUSH] Broadcast complete: sent=${sent} pruned=${pruned} deferred=${deferred}`);
  return { sent, pruned, deferred };
}

module.exports = {
  saveSubscription,
  removeSubscription,
  removeSubscriptionsForEmail,
  countForEmail,
  broadcast,
};
