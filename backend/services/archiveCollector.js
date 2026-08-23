/**
 * EnergyScope solar-generation archival collector.
 *
 * Standalone process (never started from server.js). Authenticates with UTL
 * through the EXISTING authentication stack (pythonAdapter login ->
 * sessionService storage -> utlApi.utlFetch with automatic token refresh on
 * 401) and stores one immutable-source-of-truth row per plant per day.
 *
 * ---------------------------------------------------------------------------
 * UNIT HANDLING (important - do not "simplify" without re-verifying)
 * ---------------------------------------------------------------------------
 * EMPIRICALLY CONFIRMED upstream behaviour (live validation 2026-08-21):
 *
 *   charts/daily : intraday half-hourly power curve whose graph is labelled
 *                  "Power (W)". Samples are WATTS.
 *                      [{ timeMinutes: 300, PvProduction: 0.0 }, ...]
 *                  Trapezoidal integration therefore yields WATT-HOURS:
 *                      Wh = SUM( (P_i + P_i+1)/2 [W] * dt_i [h] )
 *                  and daily energy is  Wh / 1000  -> kWh.
 *                  Proof: 2026-08-21 integrated to 18370.61 Wh = 18.37061 kWh,
 *                  matching the monthly day-row 18.45 kWh (ratio 0.9957).
 *
 *   charts/monthly: one PvProduction row per day, in kWh (confirmed against
 *                  the daily curve above and multiple real days: 3.79,
 *                  16.71, 19.40, 13.07, 15.51 kWh).
 *
 *   charts/yearly + charts/total: known upstream 1000x scaling quirk. The
 *                  API numeric values behave like MWh-labelled numbers that
 *                  the app displays as MWh while we need kWh internally, so
 *                  the EXISTING frontend normalization
 *                      (source yearly|total ? value * 1000 : value)
 *                  in src/services/solarService.ts is INTENTIONAL AND CORRECT.
 *                  Do NOT remove or bypass it. These endpoints are never
 *                  treated as archival truth here regardless.
 *
 * Gaps between daily samples longer than MAX_SAMPLE_GAP_MIN are truncated to
 * that cap so a missing stretch cannot fabricate energy.
 *
 * If the daily curve is unavailable for a date, the collector falls back to
 * the monthly endpoint's day-row value taken verbatim as kWh (explicitly
 * flagged in the `source` column), because a continuous archive is preferred
 * over holes. The uncertainty lives in raw_unit/source columns forever.
 * ---------------------------------------------------------------------------
 */

const crypto = require("crypto");

const sessionService = require("./sessionService");
const pythonAdapter = require("../adapters/pythonAdapter");
const utlApi = require("./utlApi");
const archiveService = require("./archiveService");

const COLLECTOR_SESSION_KEY = "__collector__";
const UTL_BASE = "https://utlsolarrms.com/api";

// A collector session must survive cleanupExpiredSessions() forever.
const SESSION_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

const MAX_SAMPLE_GAP_MIN = 90;
const CHECK_RATIO_WARN_LOW = 0.75;
const CHECK_RATIO_WARN_HIGH = 1.25;

function log(...args) {
  console.log("[ARCHIVE]", ...args);
}

// ---------------------------------------------------------------------------
// Curve math
// ---------------------------------------------------------------------------

/**
 * Trapezoid-integrates [{timeMinutes, PvProduction}] where PvProduction
 * samples are WATTS (daily graph is labelled "Power (W)").
 * Returns WATT-HOURS: Wh = SUM( avgW * dtHours ).
 */
function integratePowerCurveWh(results) {
  if (!Array.isArray(results)) return null;

  const points = results
    .map((r) => ({ t: Number(r.timeMinutes), p: Number(r.PvProduction) }))
    .filter((pt) => Number.isFinite(pt.t) && Number.isFinite(pt.p))
    .sort((a, b) => a.t - b.t);

  if (points.length === 0) return null;

  let wattHours = 0;
  let cappedGap = false;

  for (let i = 0; i < points.length - 1; i++) {
    let dtMin = points[i + 1].t - points[i].t;
    if (dtMin <= 0) continue;
    if (dtMin > MAX_SAMPLE_GAP_MIN) {
      dtMin = MAX_SAMPLE_GAP_MIN;
      cappedGap = true;
    }
    const avgW = (points[i].p + points[i + 1].p) / 2;
    wattHours += avgW * (dtMin / 60);
  }

  return { wattHours, pointsCount: points.length, cappedGap };
}

// ---------------------------------------------------------------------------
// Authentication (reuse of existing stack - no second mechanism)
// ---------------------------------------------------------------------------

async function ensureCollectorSession(deps = {}) {
  const adapter = deps.pythonAdapter || pythonAdapter;
  const sessions = deps.sessionService || sessionService;

  const existing = sessions.getSession(COLLECTOR_SESSION_KEY);
  if (existing?.utlToken && existing?.email && existing?.password) {
    log("Reusing stored collector session.");
    return existing;
  }

  const email = process.env.UTL_COLLECTOR_EMAIL;
  const password = process.env.UTL_COLLECTOR_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Collector credentials missing. Set UTL_COLLECTOR_EMAIL and UTL_COLLECTOR_PASSWORD."
    );
  }

  log("Logging in to UTL as collector...");
  const response = await adapter.login(email, password);

  if (!response?.success || !response?.token) {
    throw new Error(response?.error || "UTL login failed.");
  }

  sessions.createSession(COLLECTOR_SESSION_KEY, {
    email,
    password,
    device_id: crypto.randomUUID(),
    utlToken: response.token,
    expiresAt: Date.now() + SESSION_TTL_MS,
    remember_me: true,
  });

  const session = sessions.getSession(COLLECTOR_SESSION_KEY);
  log("Collector session established.");
  return session;
}

// ---------------------------------------------------------------------------
// Upstream calls (same URLs/body shape as routes/charts.js)
// ---------------------------------------------------------------------------

async function postChart(session, endpoint, body, deps = {}) {
  const api = deps.utlApi || utlApi;
  const response = await api.utlFetch(COLLECTOR_SESSION_KEY, session, `${UTL_BASE}/charts/solar_power_per_plant/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return JSON.parse(text);
}

/** Non-fatal check that the configured plant id exists upstream. */
async function verifyPlantId(session, plantId, deps = {}) {
  try {
    const status = await (deps.utlApi || utlApi).getPlantStatus(
      COLLECTOR_SESSION_KEY,
      session
    );
    const ids = (status?.data?.total?.plantIds ?? []).map(String);
    if (ids.length === 0) {
      log("WARN PlantStatus returned no plant ids.");
    } else if (!ids.includes(String(plantId))) {
      log(`WARN Configured plant ${plantId} not in upstream ids: ${ids.join(", ")}`);
    } else {
      log(`Plant: ${plantId} verified against upstream.`);
    }
  } catch (err) {
    log(`WARN PlantStatus verification skipped: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Core collection for ONE calendar day (Asia/Kolkata date string)
// ---------------------------------------------------------------------------

async function collectDate(dateStr, deps = {}) {
  const service = deps.archiveService || archiveService;
  const plantId = service.PLANT_ID();

  const session = await ensureCollectorSession(deps);

  if (!(deps.skipPlantCheck)) {
    await verifyPlantId(session, plantId, deps);
  }

  log(`UTL response received for ${dateStr}.`);

  // --- Primary source: daily power curve -----------------------------------
  let dailyJson = null;
  let dailyError = null;
  try {
    dailyJson = await postChart(
      session,
      "daily",
      { plant_id: Number(plantId), date_parameter: dateStr },
      deps
    );
  } catch (err) {
    dailyError = err.message;
    log(`WARN Daily endpoint failed for ${dateStr}: ${dailyError}`);
  }

  // --- Cross-check / fallback source: monthly day-row ----------------------
  const month = dateStr.slice(0, 7);
  const dayNumber = Number(dateStr.slice(8, 10));
  let monthlyRow = null;
  try {
    const monthlyJson = await postChart(
      session,
      "monthly",
      { plant_id: Number(plantId), date_parameter: month },
      deps
    );
    monthlyRow = (monthlyJson?.results ?? []).find(
      (row) => Number(row.date) === dayNumber
    );
  } catch (err) {
    log(`WARN Monthly endpoint failed for ${dateStr}: ${err.message}`);
  }

  const monthlyValue =
    monthlyRow && Number.isFinite(Number(monthlyRow.PvProduction))
      ? Number(monthlyRow.PvProduction)
      : null;

  // --- Decide the normalized value -----------------------------------------
  let generationKwh = null;
  let rawGenerationValue = null;
  let rawUnit = null;
  let source = null;
  let pointsCount = null;
  let checkMonthlyValue = null;
  let checkRatio = null;

  const integration =
    dailyJson ? integratePowerCurveWh(dailyJson.results) : null;

  if (integration && integration.pointsCount > 0) {
    // Daily samples are WATTS, so integration.wattHours is watt-hours.
    const integratedWh = integration.wattHours;
    const generationKwhFromCurve = integratedWh / 1000; // W·h -> kWh
    generationKwh = generationKwhFromCurve;
    pointsCount = integration.pointsCount;
    source = "charts/daily_integrated";
    checkMonthlyValue = monthlyValue;

    if (integration.cappedGap) {
      log(`WARN ${dateStr}: curve had a gap >${MAX_SAMPLE_GAP_MIN}min; contribution truncated.`);
    }

    if (monthlyValue !== null) {
      // The single scalar UTL emits for this day is preserved verbatim (kWh).
      rawGenerationValue = monthlyValue;
      rawUnit = "kWh_monthly_row";
      checkRatio = monthlyValue > 0 ? generationKwh / monthlyValue : null;

      if (
        checkRatio !== null &&
        (checkRatio < CHECK_RATIO_WARN_LOW || checkRatio > CHECK_RATIO_WARN_HIGH)
      ) {
        log(
          `WARN ${dateStr}: integrated ${generationKwh.toFixed(2)} kWh vs monthly row ${monthlyValue} kWh (ratio ${checkRatio.toFixed(3)}). Units may differ - investigate before trusting either.`
        );
      }
    } else {
      rawGenerationValue = integratedWh;
      rawUnit = "Wh_integrated_from_W_samples";
    }
  } else if (monthlyValue !== null) {
    // Explicit fallback - flagged in source forever. Monthly rows are
    // confirmed kWh, but the daily curve was unavailable so provenance is flagged.
    generationKwh = monthlyValue;
    rawGenerationValue = monthlyValue;
    rawUnit = "kWh_monthly_row";
    source = "charts/monthly_fallback";
    log(`WARN ${dateStr}: archived from monthly fallback (daily curve unavailable${dailyError ? ": " + dailyError : ""}).`);
  } else {
    throw new Error(
      `No usable data for ${dateStr}${dailyError ? ` (daily: ${dailyError})` : ""}`
    );
  }

  log(
    `Raw generation: ${rawGenerationValue ?? "n/a"} (${rawUnit ?? "n/a"}) | Normalized: ${generationKwh.toFixed(3)} kWh via ${source}`
  );

  const record = {
    plantId,
    generationDate: dateStr,
    generationKwh,
    rawGenerationValue,
    rawUnit,
    source,
    pointsCount,
    checkMonthlyValue,
    checkRatio,
  };

  const outcome = service.upsertDailyGeneration(record);
  log(`Stored ${dateStr} [${outcome.result}]`);

  if (dailyJson) {
    service.storePowerCurve({
      plantId,
      generationDate: dateStr,
      pointsCount: pointsCount ?? 0,
      payload: dailyJson,
    });
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// Multi-day runs (backfill safe, continues past individual failures)
// ---------------------------------------------------------------------------

function enumerateDates(fromStr, toStr) {
  const out = [];
  let cursor = Date.parse(`${fromStr}T00:00:00Z`);
  const end = Date.parse(`${toStr}T00:00:00Z`);
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

async function runCollection(dates, triggerType, deps = {}) {
  const service = deps.archiveService || archiveService;
  const runId = service.startRun(triggerType);

  let stored = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const failures = [];

  for (const dateStr of dates) {
    log(`Starting collection for ${dateStr}`);
    try {
      const outcome = await collectDate(dateStr, deps);
      if (outcome.result === "inserted") inserted++;
      else if (outcome.result === "updated") updated++;
      else unchanged++;
      stored++;
    } catch (err) {
      failures.push({ date: dateStr, error: err.message });
      log(`ERROR ${dateStr}: ${err.message}`);
    }
  }

  const status =
    failures.length === 0
      ? "success"
      : stored > 0
        ? "partial"
        : "failed";

  service.finishRun(runId, {
    status,
    datesRequested: dates.length,
    datesStored: stored,
    error: failures.length ? JSON.stringify(failures) : null,
  });

  const coverage = service.getCoverage();
  log("Collection completed.");
  log(
    `Summary: requested=${dates.length} stored=${stored} (new=${inserted} refreshed=${updated} unchanged=${unchanged}) failed=${failures.length}`
  );
  log(
    `Coverage: ${coverage.earliest ?? "-"} .. ${coverage.latest ?? "-"} (${coverage.daysArchived} days)`
  );

  return { status, stored, inserted, updated, unchanged, failures, coverage };
}

module.exports = {
  integratePowerCurveWh,
  ensureCollectorSession,
  collectDate,
  enumerateDates,
  runCollection,
  COLLECTOR_SESSION_KEY,
};
