const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = __dirname;

function resolveDbPath() {
  const configured = process.env.ARCHIVE_DB_PATH;
  if (configured && configured.trim()) {
    return path.isAbsolute(configured) ? configured : path.join(DATA_DIR, configured);
  }
  return path.join(DATA_DIR, "archive.db");
}

let db = null;

/**
 * Opens (and creates if needed) the dedicated archive database.
 * Kept fully separate from data/sessions.db so archival can never
 * interfere with authentication storage and can be backed up alone.
 */
function getArchiveDb() {
  if (db) return db;

  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // WAL allows the API process to read while the collector writes.
  db.pragma("journal_mode = WAL");
  // NORMAL with WAL is crash-safe against application failure and much
  // faster than FULL; only a power loss may lose the last transactions.
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  initSchema(db);

  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS solar_generation_daily (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id            TEXT NOT NULL,
      generation_date     TEXT NOT NULL,
      generation_kwh      REAL NOT NULL,
      raw_generation_value REAL NOT NULL,
      raw_unit            TEXT NOT NULL,
      source              TEXT NOT NULL,
      points_count        INTEGER,
      check_monthly_value REAL,
      check_ratio         REAL,
      collected_at        INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL,
      UNIQUE (plant_id, generation_date)
    );

    CREATE INDEX IF NOT EXISTS idx_sgd_plant_date
      ON solar_generation_daily(plant_id, generation_date);

    CREATE INDEX IF NOT EXISTS idx_sgd_generation_date
      ON solar_generation_daily(generation_date);

    CREATE TABLE IF NOT EXISTS solar_power_curve (
      plant_id        TEXT NOT NULL,
      generation_date TEXT NOT NULL,
      points_count    INTEGER NOT NULL,
      raw_payload     TEXT NOT NULL,
      collected_at    INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      UNIQUE (plant_id, generation_date)
    );

    CREATE INDEX IF NOT EXISTS idx_spc_date
      ON solar_power_curve(generation_date);

    CREATE TABLE IF NOT EXISTS archive_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type   TEXT NOT NULL,
      started_at     INTEGER NOT NULL,
      finished_at    INTEGER,
      status         TEXT NOT NULL DEFAULT 'running',
      dates_requested INTEGER NOT NULL DEFAULT 0,
      dates_stored   INTEGER NOT NULL DEFAULT 0,
      error_text     TEXT
    );
  `);
}

module.exports = { getArchiveDb };
