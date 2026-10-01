#!/usr/bin/env node
/**
 * DEVELOPMENT-ONLY archive seed for testing the Dashboard "Manual Archive
 * Entry" workflow on localhost.
 *
 * WHY: the local archive DB (backend/data/archive.db) is filled by the real
 * headless collector, so it drifts behind the current month. With no rows in
 * the current month the History page's "EnergyScope Archive" view looks empty
 * and there is nothing meaningful to verify a manual entry against. This
 * script inserts a small set of clearly-labelled DEV rows so the archive UI,
 * the summary endpoint and a manual_override write can all be exercised
 * locally.
 *
 * This is APPROACH A (controlled records in the existing local archive DB),
 * wrapped in the guards of APPROACH B. It is a developer tool only:
 *   - it is NOT imported by the server, the collector or the frontend
 *   - every row it writes carries source = 'dev_fixture' (a label the real
 *     collector never produces), so dev rows are identifiable and separable
 *   - it never overwrites an existing row for a date unless --force is passed
 *   - it backs the DB up before writing and can remove exactly what it added
 *     with --clear
 *
 * NEVER RUN THIS ON THE PRODUCTION SERVER. It refuses to run when
 * NODE_ENV=production, requires the explicit --dev flag, and prints a loud
 * banner with the resolved database path.
 *
 * Usage:
 *   node scripts/seed-dev-archive.js --dev
 *                        -> seed the current IST month (default: 1st..today)
 *   node scripts/seed-dev-archive.js --dev --month 2026-09
 *                        -> seed one specific month
 *   node scripts/seed-dev-archive.js --dev --no-weather
 *                        -> skip the matching weather snapshots
 *   node scripts/seed-dev-archive.js --dev --force
 *                        -> also overwrite existing rows for seeded dates
 *   node scripts/seed-dev-archive.js --dev --clear
 *                        -> delete only the dev_fixture rows, keep real data
 *
 * The dev archive master password is NOT created here. Run
 *   node scripts/hash-master-password.js "<secret>"
 * and put the printed hash in backend/.env as ARCHIVE_MASTER_PASSWORD_HASH.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const archiveService = require("../services/archiveService");
const { getArchiveDb } = require("../data/archiveDatabase");

const DEV_SOURCE = "dev_fixture";

function parseArgs(argv) {
  const args = { dev: false, force: false, clear: false, weather: true, month: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dev") args.dev = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--clear") args.clear = true;
    else if (arg === "--no-weather") args.weather = false;
    else if (arg === "--month") args.month = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function istDateString(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function enumerateMonth(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!match) throw new Error("--month must be YYYY-MM");

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const today = istDateString(new Date());

  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
    // Never fabricate a day the collector would own going forward: today and
    // future stay untouched unless explicitly targeted.
    if (date > today) break;
    dates.push(date);
  }

  return dates;
}

/** Deterministic, obviously-synthetic profile so reruns are stable. */
function devValueFor(date, index) {
  return Number((5.5 + ((index * 7) % 11) * 0.9).toFixed(2));
}

function banner(dbPath) {
  console.log("");
  console.log("  ============================================================");
  console.log("   DEVELOPMENT-ONLY SEED - NOT FOR PRODUCTION");
  console.log(`   target database: ${dbPath}`);
  console.log(`   rows carry source = '${DEV_SOURCE}'`);
  console.log("  ============================================================");
  console.log("");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      "Usage: node scripts/seed-dev-archive.js --dev [--month YYYY-MM] [--force] [--clear] [--no-weather]",
    );
    return;
  }

  if (!args.dev) {
    console.error("Refusing to run without --dev. This script is for local development only.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV=production. This is a development-only script.");
    process.exit(1);
  }

  const dbPath = path.resolve(
    process.env.ARCHIVE_DB_PATH || path.join(__dirname, "..", "data", "archive.db"),
  );
  banner(dbPath);

  const db = getArchiveDb();
  const plantId = archiveService.PLANT_ID();
  const selectRow = db.prepare(
    "SELECT source FROM solar_generation_daily WHERE plant_id = ? AND generation_date = ?",
  );
  const deleteDevRows = db.prepare(
    "DELETE FROM solar_generation_daily WHERE plant_id = ? AND source = ?",
  );

  if (args.clear) {
    const removed = deleteDevRows.run(plantId, DEV_SOURCE).changes;
    console.log(`Removed ${removed} dev_fixture row(s) for plant ${plantId}. Real rows untouched.`);
    return;
  }

  const month = args.month || istDateString(new Date()).slice(0, 7);
  const dates = enumerateMonth(month);
  if (dates.length === 0) {
    console.log(`No completed days in ${month}; nothing to seed.`);
    return;
  }

  // Back up before writing anything. VACUUM INTO yields a consistent copy even
  // though the DB is in WAL mode; it refuses an existing file, so drop first.
  const backupPath = `${dbPath}.devseed.bak`;
  try {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    db.prepare("VACUUM INTO ?").run(backupPath);
    console.log(`Backup written: ${backupPath}`);
  } catch (err) {
    console.warn(`Backup skipped (${err.message}); the rows are removable with --clear.`);
  }

  const run = db.transaction(() => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    dates.forEach((date, index) => {
      const existing = selectRow.get(plantId, date);
      if (existing && !args.force) {
        skipped++;
        return;
      }

      const kwh = devValueFor(date, index);
      archiveService.upsertDailyGeneration({
        plantId,
        generationDate: date,
        generationKwh: kwh,
        rawGenerationValue: kwh,
        rawUnit: "kWh_dev_fixture",
        source: DEV_SOURCE,
        pointsCount: 0,
        checkMonthlyValue: kwh,
        checkRatio: null,
      });

      if (existing) updated++;
      else inserted++;

      if (args.weather) {
        archiveService.upsertWeatherSnapshot({
          plantId,
          snapshotDate: date,
          cloudCover: 20 + ((index * 11) % 50),
          rainProbability: ((index * 3) % 20) / 100,
          weatherCode: 8000 + ((index * 5) % 30),
          uvIndex: 4 + (index % 5),
          precipitationSumMm: 0,
        });
      }
    });

    return { inserted, updated, skipped };
  })();

  console.log(`Month ${month}: ${dates.length} completed day(s) considered.`);
  console.log(`  inserted: ${run.inserted}`);
  console.log(`  updated : ${run.updated}${run.updated > 0 && !args.force ? " (with --force)" : ""}`);
  console.log(`  skipped : ${run.skipped} (already had a row; use --force to overwrite)`);
  console.log("");
  console.log("Now: History page -> 'EnergyScope Archive' source -> 'Manual Archive Entry'.");
  console.log("Remove these rows any time with: node scripts/seed-dev-archive.js --dev --clear");
}

main();
