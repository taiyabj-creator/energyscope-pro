/**
 * EnergyScope Web Push service.
 *
 * Responsibilities:
 *  - store/update/remove push subscriptions tied to the authenticated email
 *  - deliver JSON payloads to every stored subscription via web-push,
 *    recording each notification in the in-app feed and queueing a persistent
 *    per-subscription retry whenever delivery fails transiently (~every 30
 *    minutes via processDueRetries(), surviving restarts)
 *  - prune ONLY subscriptions the push provider reports as gone
 *    (404/410). Transient failures (timeouts, 429, 5xx) are kept and
 *    retried; one bad subscription never causes removal of others.
 *
 * SECURITY:
 *  - VAPID keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 *    VAPID_SUBJECT). The private key is never logged.
 *  - Subscription endpoints embed capability secrets: they are NEVER logged,
 *    not even truncated. Failures are reported by row id + status code only.
 */

const db = require("../data/notificationDatabase");

// Failed deliveries are retried roughly every 30 minutes, up to ~24h.
const RETRY_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 48;

// In-app notification feed retention.
const FEED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function getWebPush(deps = {}) {
  if (deps.webPush) return deps.webPush;
  const webPush = require("web-push");
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    throw new Error("Push not configured: missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
  }
  webPush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return webPush;
}

/** Upsert a subscription for an authenticated user. Idempotent per endpoint. */
function saveSubscription(email, subscription, deps = {}) {
  const store = deps.db || db;
  if (!subscription || typeof subscription.endpoint !== "string") {
    throw new Error("Invalid push subscription payload: endpoint missing.");
  }

  let endpointOrigin = "unknown";
  try {
    const parsed = new URL(subscription.endpoint);
    if (parsed.protocol !== "https:") {
      throw new Error("non-https endpoint");
    }
    endpointOrigin = parsed.origin;
  } catch (err) {
    throw new Error("Invalid push subscription payload: endpoint must be a valid HTTPS URL.");
  }

  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("Invalid push subscription payload: keys.p256dh and keys.auth required.");
  }

  const expirationTime =
    Number.isFinite(Number(subscription.expirationTime)) && subscription.expirationTime !== null
      ? Number(subscription.expirationTime)
      : null;

  // Safe to log: origin only, never the full capability URL or key material.
  console.log(`[PUSH] Subscription stored for ${String(email)} (${endpointOrigin}).`);

  store
    .prepare(
      `INSERT INTO push_subscriptions (email, endpoint, p256dh, auth, expiration_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         email = excluded.email,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         expiration_time = excluded.expiration_time,
         updated_at = excluded.updated_at,
         failure_count = 0`,
    )
    .run(
      String(email),
      subscription.endpoint,
      String(subscription.keys.p256dh),
      String(subscription.keys.auth),
      expirationTime,
      Date.now(),
      Date.now(),
    );
}

function removeSubscription(endpoint, deps = {}) {
  (deps.db || db)
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .run(String(endpoint));
}

function removeSubscriptionsForEmail(email, deps = {}) {
  (deps.db || db).prepare("DELETE FROM push_subscriptions WHERE email = ?").run(String(email));
}

function countForEmail(email, deps = {}) {
  return (deps.db || db)
    .prepare("SELECT COUNT(*) AS c FROM push_subscriptions WHERE email = ?")
    .get(String(email)).c;
}

// ---------------------------------------------------------------------------
// In-app notification feed
// ---------------------------------------------------------------------------

function recordNotification(payload, deps = {}) {
  const store = deps.db || db;
  const nowFn = deps.now || (() => Date.now());
  const info = store
    .prepare(
      `INSERT INTO notifications (kind, title, body, url, read, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
    .run(
      String(payload?.kind ?? "info"),
      String(payload?.title ?? "EnergyScope"),
      String(payload?.body ?? ""),
      typeof payload?.url === "string" ? payload.url : null,
      nowFn(),
    );
  return Number(info.lastInsertRowid);
}

function pruneOldNotifications(deps = {}) {
  const store = deps.db || db;
  const nowFn = deps.now || (() => Date.now());
  const cutoff = nowFn() - FEED_RETENTION_MS;
  const info = store.prepare("DELETE FROM notifications WHERE created_at < ?").run(cutoff);
  if (info.changes > 0) {
    console.log(`[PUSH] Pruned ${info.changes} notification(s) older than 7 days.`);
  }
}

function listNotifications({ limit = 50 } = {}, deps = {}) {
  const store = deps.db || db;
  const nowFn = deps.now || (() => Date.now());
  pruneOldNotifications(deps);
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return store
    .prepare(
      `SELECT id, kind, title, body, url, read, created_at
       FROM notifications
       WHERE created_at >= ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(nowFn() - FEED_RETENTION_MS, capped);
}

function markNotificationsRead({ ids = null } = {}, deps = {}) {
  const store = deps.db || db;
  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    const info = store
      .prepare(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders})`)
      .run(...ids.map(Number));
    return info.changes;
  }
  const info = store.prepare("UPDATE notifications SET read = 1 WHERE read = 0").run();
  return info.changes;
}

function dismissNotification(id, deps = {}) {
  const store = deps.db || db;
  const info = store.prepare("DELETE FROM notifications WHERE id = ?").run(Number(id));
  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// Delivery + persistent retry queue
// ---------------------------------------------------------------------------

function queueRetry(rowId, rawPayload, errorMessage, deps = {}) {
  const store = deps.db || db;
  const nowFn = deps.now || (() => Date.now());
  store
    .prepare(
      `INSERT INTO push_retry (subscription_id, payload_json, attempts, next_attempt_at, last_error, created_at)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(subscription_id, payload_json) DO UPDATE SET
         attempts = attempts + 1,
         next_attempt_at = excluded.next_attempt_at,
         last_error = excluded.last_error`,
    )
    .run(
      rowId,
      rawPayload,
      nowFn() + RETRY_INTERVAL_MS,
      String(errorMessage).slice(0, 500),
      nowFn(),
    );
}

function clearRetry(rowId, rawPayload, deps = {}) {
  (deps.db || db)
    .prepare("DELETE FROM push_retry WHERE subscription_id = ? AND payload_json = ?")
    .run(rowId, rawPayload);
}

/**
 * Deliver every due retry row. Rows whose subscription vanished are dropped;
 * 404/410 drops the retry AND prunes the subscription; other failures are
 * re-queued with attempts+1 until MAX_RETRY_ATTEMPTS is reached.
 * Safe to call at any frequency: only rows with next_attempt_at <= now act.
 */
async function processDueRetries(deps = {}) {
  const store = deps.db || db;
  const sender =
    deps.sendNotification || ((sub, json) => getWebPush(deps).sendNotification(sub, json));
  const nowFn = deps.now || (() => Date.now());
  const now = nowFn();

  const due = store
    .prepare(
      `SELECT r.id AS retry_id, r.subscription_id, r.payload_json, r.attempts, r.last_error,
              s.endpoint, s.p256dh, s.auth
       FROM push_retry r
       LEFT JOIN push_subscriptions s ON s.id = r.subscription_id
       WHERE r.next_attempt_at <= ?
       ORDER BY r.next_attempt_at ASC`,
    )
    .all(now);

  let sent = 0;
  let pruned = 0;
  let dropped = 0;
  let requeued = 0;

  for (const item of due) {
    if (!item.endpoint) {
      // Subscription deleted while a retry was pending.
      store.prepare("DELETE FROM push_retry WHERE id = ?").run(item.retry_id);
      dropped++;
      continue;
    }

    try {
      await sender(
        { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
        item.payload_json,
      );
      store.prepare("DELETE FROM push_retry WHERE id = ?").run(item.retry_id);
      sent++;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        store.prepare("DELETE FROM push_retry WHERE id = ?").run(item.retry_id);
        store.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(item.subscription_id);
        pruned++;
      } else if (item.attempts + 1 >= MAX_RETRY_ATTEMPTS) {
        store.prepare("DELETE FROM push_retry WHERE id = ?").run(item.retry_id);
        console.log(
          `[PUSH] Retry row #${item.retry_id} abandoned after ${item.attempts + 1} attempts (status ${statusCode ?? "n/a"}).`,
        );
        dropped++;
      } else {
        queueRetry(item.subscription_id, item.payload_json, err?.message ?? "unknown error", deps);
        requeued++;
      }
    }
  }

  if (due.length > 0) {
    console.log(
      `[PUSH] Retry pass: due=${due.length} sent=${sent} pruned=${pruned} requeued=${requeued} dropped=${dropped}`,
    );
  }
  return { due: due.length, sent, pruned, requeued, dropped };
}

/**
 * Send a JSON payload to every stored subscription. The notification is first
 * recorded in the in-app feed; transient per-subscription failures are queued
 * for persistent retry (~every 30 minutes). Returns {sent, pruned, deferred}.
 */
async function broadcast(payload, deps = {}) {
  const store = deps.db || db;
  const sender =
    deps.sendNotification || ((sub, json) => getWebPush(deps).sendNotification(sub, json));
  pruneOldNotifications(deps);
  recordNotification(payload, deps);

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
        raw,
      );
      clearRetry(row.id, raw, deps);
      sent++;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired/revoked upstream - remove exactly this row.
        store.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
        clearRetry(row.id, raw, deps);
        pruned++;
      } else {
        // Network hiccup / rate limit / provider 5xx: persist for retry.
        queueRetry(row.id, raw, err?.message ?? "unknown error", deps);
        store
          .prepare("UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?")
          .run(row.id);
        deferred++;
        console.log(
          `[PUSH] Delivery deferred for push row #${row.id} (status ${statusCode ?? "n/a"}).`,
        );
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
  processDueRetries,
  recordNotification,
  listNotifications,
  markNotificationsRead,
  dismissNotification,
  pruneOldNotifications,
  RETRY_INTERVAL_MS,
  MAX_RETRY_ATTEMPTS,
  FEED_RETENTION_MS,
};
