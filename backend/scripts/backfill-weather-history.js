#!/usr/bin/env node
/**
 * One-time backfill of historical weather snapshots for archived solar
 * generation days, plus on-demand automated collection going forward.
 *
 * Populates the daily_weather_snapshot table from Open-Meteo's archive API
 * for every date present in solar_generation_daily that does not yet have a
 * snapshot. Also fills today (via the live weather service) if requested.
 *
 * Usage:
 *   node scripts/backfill-weather-history.js
 *                            -> backfill every archived day missing a snapshot
 *   node scripts/backfill-weather-history.js --from 2026-08-01 --to 2026-08-25
 *                            -> backfill a specific date range
 *   node scripts/backfill-weather-history.js --date 2026-08-21
 *                            -> backfill one day
 *   node scripts/backfill-weather-history.js --include-today
 *                            -> also snapshot today using live weather
 *
 * Required environment (backend/.env): none beyond defaults.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const archiveService = require("../services/archiveService");
const {
  fetchHistoricalWeather,
  collectWeatherSnapshot,
  collectDate,
  ensureCollectorSession,
  enumerateDates,
} = require("../services/archiveCollector");

const PLANT_ID = archiveService.PLANT_ID();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date") args.date = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--populate-local") args.populateLocal = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force-weather") args.forceWeather = true;
    else if (a === "--include-today") args.includeToday = true;
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
      "Usage: node scripts/backfill-weather-history.js [--from YYYY-MM-DD --to YYYY-MM-DD | --date YYYY-MM-DD | --populate-local [--from YYYY-MM-DD]] [--dry-run]",
    );
    console.log(
      "  --populate-local : one-time local population of BOTH generation (from UTL's real monthly PvProduction scalars) and weather (Open-Meteo) for Aug 1..today by default, or --from/--to range. Only inserts generation for dates with no existing row; never overwrites valid generation.",
    );
    console.log("  --dry-run        : verify values without writing anything.");
    process.exit(0);
  }

  const todayIst = archiveService.istDateString(new Date());
  let dates;

  if (args.populateLocal) {
    const from = args.from || "2026-08-01";
    const to = args.to || todayIst;
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
      console.log("[WEATHER-BACKFILL] ERROR invalid --from/--to range for --populate-local.");
      process.exit(2);
    }
    dates = enumerateDates(from, to);
  } else if (args.date) {
    if (!isValidIsoDate(args.date)) {
      console.log("[WEATHER-BACKFILL] ERROR --date must be a valid YYYY-MM-DD date.");
      process.exit(2);
    }
    dates = [args.date];
  } else if ((args.from || args.to) && (!args.from || !args.to)) {
    console.log("[WEATHER-BACKFILL] ERROR --from and --to must be provided together.");
    process.exit(2);
  } else if (args.from && args.to) {
    if (!isValidIsoDate(args.from) || !isValidIsoDate(args.to) || args.from > args.to) {
      console.log("[WEATHER-BACKFILL] ERROR invalid --from/--to range.");
      process.exit(2);
    }
    dates = enumerateDates(args.from, args.to);
  } else {
    // All archived days without a snapshot
    const archived = archiveService.getDailyRecords({});
    dates = archived.map((r) => r.generation_date);
    if (args.includeToday) {
      if (!dates.includes(todayIst)) dates.push(todayIst);
    }
  }

  // Deduplicate while preserving order (guard against overlapping flags).
  dates = [...new Set(dates)];

  if (dates.length === 0) {
    console.log("[WEATHER-BACKFILL] No dates to process.");
    process.exit(0);
  }

  console.log(`[WEATHER-BACKFILL] Processing ${dates.length} date(s)...`);

  // Generation and weather are handled independently of one another so that a
  // weather failure can never delay/overwrite/abort generation collection, and
  // vice-versa. Generation reuses the production collectDate() path, which pulls
  // UTL's canonical monthly-row scalar and preserves existing valid rows.
  let genIns = 0;
  let genUnchanged = 0;
  let genUpdated = 0;
  let genUnavailable = 0;
  let wxStored = 0;
  let wxUnchanged = 0;
  let wxUnavailable = 0;
  const genMissing = [];
  const wxMissing = [];

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];

    // --- Generation (only for --populate-local) -----------------------------
    if (args.populateLocal) {
      const existing = archiveService.getDailyRecords({ date: d })[0];
      if (args.dryRun) {
        console.log(
          `  [DRY] ${d}: existingGeneration=${existing ? `${existing.generation_kwh} (${existing.source})` : "none"} | weatherExisting=${archiveService.getWeatherSnapshot(PLANT_ID, d) ? "yes" : "no"}`,
        );
        continue;
      }
      if (existing) {
        // Valid existing generation record: never overwrite it. Report unchanged.
        genUnchanged++;
        console.log(
          `  [GEN] ${d}: existing row kept unchanged (${existing.generation_kwh} kWh, ${existing.source}).`,
        );
      } else {
        try {
          const outcome = await collectDate(d);
          const res = outcome && outcome.result;
          if (res === "inserted") genIns++;
          else if (res === "updated") genUpdated++;
          else genUnchanged++;
          console.log(`  [GEN] ${d}: ${res || "done"} via production collectDate().`);
        } catch (err) {
          genUnavailable++;
          genMissing.push(d);
          console.log(`  [GEN-WARN] ${d}: no UTL generation data (${err.message})`);
        }
      }
    }

    // --- Weather (separate pass, never blocks/overwrites generation) --------
    // Historical dates (strictly before today) use OBSERVED archive weather and
    // can be force-refreshed to replace previously incorrect forecast-probability
    // values. Today's snapshot is kept separate (live weather) and untouched.
    if (args.dryRun) continue;

    if (d >= todayIst) {
      console.log(`  [WX] ${d}: today/future left as live snapshot (not historical).`);
      continue;
    }

    if (archiveService.getWeatherSnapshot(PLANT_ID, d) && !args.forceWeather) {
      wxUnchanged++;
      continue;
    }

    const weather = await fetchHistoricalWeather(d);
    if (!weather) {
      console.log(`  [WARN] No weather for ${d}`);
      wxUnavailable++;
      wxMissing.push(d);
      continue;
    }
    archiveService.upsertWeatherSnapshot({
      plantId: PLANT_ID,
      snapshotDate: d,
      cloudCover: weather.cloudCover,
      rainProbability: weather.rainProbability,
      weatherCode: weather.weatherCode,
      uvIndex: weather.uvIndex,
      precipitationSumMm: weather.precipitationSumMm,
    });
    wxStored++;
    console.log(
      `  [WX] ${d}: cloud=${weather.cloudCover} rain=${weather.rainProbability} code=${weather.weatherCode} uv=${weather.uvIndex} precip_mm=${weather.precipitationSumMm}${args.forceWeather ? " (forced)" : ""}`,
    );
    // Respect a ~1 req/s rate limit on the free tier
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[WEATHER-BACKFILL] Done.`);
  if (args.populateLocal) {
    console.log(
      `  GENERATION: inserted=${genIns} updated=${genUpdated} unchanged=${genUnchanged} unavailable=${genUnavailable}`,
    );
    if (genMissing.length)
      console.log(`  GENERATION missing (no UTL data): ${genMissing.join(", ")}`);
  }
  console.log(
    `  WEATHER: stored=${wxStored} unchanged=${wxUnchanged} unavailable=${wxUnavailable}`,
  );
  if (wxMissing.length) console.log(`  WEATHER missing: ${wxMissing.join(", ")}`);
  process.exit(0);
}

main();
