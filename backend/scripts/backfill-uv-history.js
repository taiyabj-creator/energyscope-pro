#!/usr/bin/env node
/**
 * UV-only historical backfill for existing daily_weather_snapshot rows.
 *
 * The collector's weather snapshots come from the Open-Meteo Archive API, which
 * provides no UV index, so every archive-backed day carries uv_index = NULL.
 * This script fills ONLY that column from the Open-Meteo Historical Forecast
 * API (uv_index_max). It never replaces the Archive API, never fetches or
 * overwrites any other weather field, never touches generation data, and never
 * changes the WF/baseline/correction model. It only updates uv_index for dates
 * that ALREADY have an existing weather snapshot.
 *
 * Usage:
 *   node scripts/backfill-uv-history.js
 *                        -> fill missing historical UV for every existing
 *                           snapshot date (strictly before today) with null UV
 *   node scripts/backfill-uv-history.js --date 2026-08-21
 *                        -> fill one day
 *   node scripts/backfill-uv-history.js --from 2026-08-01 --to 2026-08-25
 *                        -> fill a specific date range
 *   node scripts/backfill-uv-history.js --force
 *                        -> also re-fetch dates that already have a UV value
 *                           (default: leave stored UV untouched)
 *   node scripts/backfill-uv-history.js --dry-run
 *                        -> verify values without writing anything
 *
 * Required environment (backend/.env): none beyond defaults.
 * Safe: 1 request/second, idempotent, historical dates only, uv_index only.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const archiveService = require("../services/archiveService");
const { fetchHistoricalUv, enumerateDates } = require("../services/archiveCollector");

const PLANT_ID = archiveService.PLANT_ID();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date") args.date = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
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
      "Usage: node scripts/backfill-uv-history.js [--from YYYY-MM-DD --to YYYY-MM-DD | --date YYYY-MM-DD] [--force] [--dry-run]",
    );
    console.log(
      "  Fills missing historical uv_index only, for EXISTING weather snapshots, from the",
    );
    console.log("  Open-Meteo Historical Forecast API (uv_index_max).");
    console.log("  --dry-run : verify/print the values without writing anything.");
    console.log("  --force   : also re-fetch dates that already have a UV value.");
    process.exit(0);
  }

  const todayIst = archiveService.istDateString(new Date());
  let dates;

  if (args.date) {
    if (!isValidIsoDate(args.date)) {
      console.log("[UV-BACKFILL] ERROR --date must be a valid YYYY-MM-DD date.");
      process.exit(2);
    }
    dates = [args.date];
  } else if ((args.from || args.to) && (!args.from || !args.to)) {
    console.log("[UV-BACKFILL] ERROR --from and --to must be provided together.");
    process.exit(2);
  } else if (args.from && args.to) {
    if (!isValidIsoDate(args.from) || !isValidIsoDate(args.to) || args.from > args.to) {
      console.log("[UV-BACKFILL] ERROR invalid --from/--to range.");
      process.exit(2);
    }
    // Restrict to dates already present as snapshots during the pass below.
    dates = enumerateDates(args.from, args.to);
  } else {
    // Default: every existing snapshot date (strictly before today) with null UV.
    dates = archiveService.getWeatherDatesMissingUv({ before: todayIst });
  }

  // Deduplicate while preserving order (guard against overlapping flags).
  dates = [...new Set(dates)];

  if (dates.length === 0) {
    console.log("[UV-BACKFILL] No existing snapshot dates to process.");
    process.exit(0);
  }

  const filtered = [];
  for (const d of dates) {
    const existing = archiveService.getWeatherSnapshot(PLANT_ID, d);
    if (!existing) {
      console.log(`  [SKIP] ${d}: no existing weather snapshot (history only).`);
      continue;
    }
    if (d >= todayIst) {
      console.log(`  [SKIP] ${d}: today/live row (historical dates only).`);
      continue;
    }
    if (existing.uv_index != null && !args.force) {
      console.log(`  [KEEP] ${d}: uv_index=${existing.uv_index} already present.`);
      continue;
    }
    filtered.push(d);
  }
  dates = filtered;

  if (dates.length === 0) {
    console.log("[UV-BACKFILL] Nothing to backfill.");
    process.exit(0);
  }

  console.log(
    `[UV-BACKFILL] Processing ${dates.length} existing historical snapshot date(s)${args.dryRun ? " (DRY-RUN)" : ""}...`,
  );

  let filled = 0;
  let unavailable = 0;

  for (const d of dates) {
    const existing = archiveService.getWeatherSnapshot(PLANT_ID, d);
    const uv = await fetchHistoricalUv(d);
    if (uv === null) {
      unavailable++;
      console.log(`  [WARN] ${d}: UV genuinely unavailable from Historical Forecast API.`);
      continue;
    }
    if (args.dryRun) {
      console.log(
        `  [DRY] ${d}: uv=${uv} would be written (existing=${existing && existing.uv_index}).`,
      );
      continue;
    }
    archiveService.updateWeatherUvIndex(PLANT_ID, d, uv);
    filled++;
    console.log(`  [UV]  ${d}: uv=${uv}`);
    // Respect a ~1 req/s rate limit on the free tier.
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `[UV-BACKFILL] Done. filled=${filled} unavailable=${unavailable}${args.dryRun ? " (nothing written)" : ""}`,
  );
  process.exit(0);
}

main();
