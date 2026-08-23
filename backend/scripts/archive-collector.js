#!/usr/bin/env node
/**
 * Standalone solar-generation archive collector.
 *
 * Usage:
 *   node scripts/archive-collector.js                       -> collect the previous completed Asia/Kolkata calendar day
 *   node scripts/archive-collector.js --date 2026-08-21     -> collect one specific day
 *   node scripts/archive-collector.js --from 2026-08-01 --to 2026-08-22
 *                                                           -> manual backfill range
 *
 * Designed for PM2:
 *   autorestart: false, cron_restart: "<daily>"
 * The script exits when done; it computes the target day itself in
 * Asia/Kolkata, so host timezone, reboots and duplicate scheduler fires are
 * all safe (the database upsert makes every run idempotent).
 *
 * Required environment (backend/.env):
 *   UTL_COLLECTOR_EMAIL / UTL_COLLECTOR_PASSWORD - UTL portal credentials
 *   ARCHIVE_PLANT_ID                              - defaults to 105717
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const archiveService = require("../services/archiveService");
const { runCollection, enumerateDates } = require("../services/archiveCollector");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date") args.date = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s) {
  if (!ISO_DATE.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Yesterday's Asia/Kolkata calendar date, computed without host-TZ trust. */
function previousCompletedIstDay() {
  const today = archiveService.istDateString(new Date());
  const cursor = Date.parse(`${today}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  return new Date(cursor).toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      "Usage: node scripts/archive-collector.js [--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD]"
    );
    process.exit(0);
  }

  let dates;

  if (args.date) {
    if (!isValidIsoDate(args.date)) {
      console.log("[ARCHIVE] ERROR --date must be a valid YYYY-MM-DD calendar date.");
      process.exit(2);
    }
    dates = [args.date];
  } else if (args.from || args.to) {
    if (!isValidIsoDate(args.from) || !isValidIsoDate(args.to) || args.from > args.to) {
      console.log("[ARCHIVE] ERROR --from/--to must be valid YYYY-MM-DD with from <= to.");
      process.exit(2);
    }
    dates = enumerateDates(args.from, args.to);
  } else {
    dates = [previousCompletedIstDay()];
  }

  const triggerType =
    dates.length === 1 ? "manual-date" : `backfill-${dates.length}d`;

  try {
    const result = await runCollection(dates, triggerType);
    // All requested dates failed -> non-zero exit so PM2/logs show it.
    process.exit(result.stored === 0 && result.failures.length > 0 ? 1 : 0);
  } catch (err) {
    console.log(`[ARCHIVE] FATAL ${err.message}`);
    process.exit(1);
  }
}

main();
