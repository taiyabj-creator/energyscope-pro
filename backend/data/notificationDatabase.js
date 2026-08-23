/**
 * EnergyScope push-notification storage.
 *
 * Separate SQLite file (notifications.db) in backend/data, mirroring the
 * archiveDatabase.js isolation pattern. Contains ONLY notification data:
 *
 *   push_subscriptions  - one row per browser/Android push endpoint
 *   daily_summary_sent  - idempotency ledger (one summary per plant per day)
 *   notification_state  - small key/value store for monitor state
 *                         (last confirmed inverter state etc.)
 *
 * SECURITY: p256dh/auth secrets are stored but are NEVER logged anywhere.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

function resolveDbPath() {
  if (process.env.NOTIFICATIONS_DB_PATH) {
    // Relative paths resolve against backend/data (same convention as ARCHIVE_DB_PATH).
    return path.isAbsolute(process.env.NOTIFICATIONS_DB_PATH)
      ? process.env.NOTIFICATIONS_DB_PATH
      : path.join(__dirname, process.env.NOTIFICATIONS_DB_PATH);
  }
  return path.join(__dirname, "notifications.db");
}

const db = new Database(resolveDbPath());
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subs_email
ON push_subscriptions(email);

CREATE TABLE IF NOT EXISTS daily_summary_sent (
  plant_id TEXT NOT NULL,
  generation_date TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  generation_kwh REAL,
  PRIMARY KEY (plant_id, generation_date)
);

CREATE TABLE IF NOT EXISTS notification_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);
`);

// Migration: expiration_time (nullable) added after initial rollout. Browsers
// almost always send null; kept for spec completeness. Guarded so existing
// databases upgrade in place without touching any other column.
try {
  db.exec(`ALTER TABLE push_subscriptions ADD COLUMN expiration_time INTEGER`);
} catch (err) {
  if (!String(err?.message || "").includes("duplicate column name")) {
    throw err;
  }
}

module.exports = db;
