const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = __dirname;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(
  path.join(dataDir, "sessions.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  device_id TEXT NOT NULL,
  utl_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  remember_me INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_email
ON sessions(email);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
ON sessions(expires_at);
`);
module.exports = db;