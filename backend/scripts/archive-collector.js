#!/usr/bin/env node
/**
 * Standalone solar-generation archive collector.
 *
 * Usage:
 *   node scripts/archive-collector.js                       -> GAP-AWARE SCAN: verify every day in
 *                                                              the required range, collect only what is
 *                                                              missing/inconsistent, then exit
 *   node scripts/archive-collector.js --date 2026-08-21     -> collect one specific day (no verification pass)
 *   node scripts/archive-collector.js --from 2026-08-01 --to 2026-08-22
 *                                                           -> manual backfill range (collect unconditionally)
 *
 * Scheduled-mode range determination:
 *   end   = previous completed Asia/Kolkata calendar day (never today)
 *   start = ARCHIVE_START_DATE when configured, otherwise the earliest day
 *           already present in solar_generation_daily.
 *
 * Designed for PM2:
 *   autorestart: false, cron_restart: "<daily>"
 * The script exits when done; it computes the target day itself in
 * Asia/Kolkata, so host timezone, reboots and duplicate scheduler fires are
 * all safe (the database upsert makes every run idempotent). Dates that fail
 * because of a temporary upstream outage stay missing and are retried
 * automatically by the next scheduled scan.
 *
 * Required environment (backend/.env):
 *   UTL_COLLECTOR_EMAIL / UTL_COLLECTOR_PASSWORD - UTL portal credentials
 *   ARCHIVE_PLANT_ID                              - defaults to 105717
 *   ARCHIVE_START_DATE                            - optional; earliest day that should be archived
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const archiveService = require("../services/archiveService");
const {
  runCollection,
  runGapAwareCollection,
} = require("../services/archiveCollector");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      "Usage: node scripts/archive-collector.js [--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD]"
    );
    process.exit(0);
  }

  let dates;
  let triggerType;

  if (args.date) {
    if (!isValidIsoDate(args.date)) {
      console.log("[ARCHIVE] ERROR --date must be a valid YYYY-MM-DD calendar date.");
      process.exit(2);
    }
    dates = [args.date];
    triggerType = "manual-date";
  } else if (args.from || args.to) {
    if (!isValidIsoDate(args.from) || !isValidIsoDate(args.to) || args.from > args.to) {
      console.log("[ARCHIVE] ERROR --from/--to must be valid YYYY-MM-DD with from <= to.");
      process.exit(2);
    }
    dates = require("../services/archiveCollector").enumerateDates(args.from, args.to);
    triggerType = `backfill-${dates.length}d`;
  }

  try {
    if (dates) {
      // Manual single-date / explicit-range mode: unchanged behaviour.
      const result = await runCollection(dates, triggerType);
      // All requested dates failed -> non-zero exit so PM2/logs show it.
      process.exit(result.stored === 0 && result.failures.length > 0 ? 1 : 0);
    } else {
      // Scheduled mode: gap-aware verify/collect scan over the whole window.
      const result = await runGapAwareCollection({ triggerType: "gap-scan" });
      process.exit(
        result.stored === 0 && result.failures.length > 0 && result.checked > 0 ? 1 : 0
      );
    }
  } catch (err) {
    console.log(`[ARCHIVE] FATAL ${err.message}`);
    process.exit(1);
  }
}

main();
