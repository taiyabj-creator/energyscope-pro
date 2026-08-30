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
 * CANONICAL VALUE POLICY: the charts/monthly day-row scalar is UTL's own
 * statement of how much energy a day produced and therefore authoritative.
 * Whenever it exists it is stored verbatim as generation_kwh
 * (source charts/monthly_row); the integrated W-curve value is kept only as
 * a diagnostic cross-check (points_count + check_ratio = integrated/canonical).
 * Integration becomes the archived value ONLY when UTL publishes no scalar
 * for the date (source charts/daily_integrated). Provenance lives in the
 * raw_unit/source columns forever.
 *
 * CANONICAL RECONCILIATION: every scheduled scan first resolves the
 * authoritative scalars for the whole window (one charts/monthly request per
 * month) and rewrites any stored row that deviates from them - regardless of
 * how the row got there (legacy integrated value, missing cross-check,
 * fallback label). This is what repairs historical rows written before the
 * canonical policy existed; it is idempotent and never fabricates values.
 * ---------------------------------------------------------------------------
 */

const crypto = require("crypto");

const sessionService = require("./sessionService");
const pythonAdapter = require("../adapters/pythonAdapter");
const utlApi = require("./utlApi");
const archiveService = require("./archiveService");

const COLLECTOR_SESSION_KEY = "__collector__";
const UTL_BASE = "https://utlsolarrms.com/api";

const plantConfig = require("../config/plant.json");

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
      "Collector credentials missing. Set UTL_COLLECTOR_EMAIL and UTL_COLLECTOR_PASSWORD.",
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
  const response = await api.utlFetch(
    COLLECTOR_SESSION_KEY,
    session,
    `${UTL_BASE}/charts/solar_power_per_plant/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  return JSON.parse(text);
}

/** Non-fatal check that the configured plant id exists upstream. */
async function verifyPlantId(session, plantId, deps = {}) {
  try {
    const status = await (deps.utlApi || utlApi).getPlantStatus(COLLECTOR_SESSION_KEY, session);
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
// Weather snapshot collection (for prediction correction model)
// ---------------------------------------------------------------------------

const fetch = global.fetch;

/**
 * Fetches historical weather from Open-Meteo's archive API for a single date.
 * Returns { cloudCover, rainProbability, weatherCode, uvIndex } or null on failure.
 * For today's date, falls back to the live weatherService.
 */
async function fetchHistoricalWeather(dateStr, deps = {}) {
  const lat = plantConfig.latitude;
  const lon = plantConfig.longitude;
  if (!lat || !lon) return null;

  const todayIst = archiveService.istDateString(new Date());
  if (dateStr >= todayIst) {
    // Today or future: use the live weather service
    const ws = deps.weatherService || require("./weatherService");
    try {
      const w = await ws.getWeather(lat, lon);
      return {
        cloudCover: w.cloudCover,
        rainProbability: w.rainProbability,
        weatherCode: w.weatherCode,
        uvIndex: w.uvIndex,
      };
    } catch (_) {
      return null;
    }
  }

  // Historical date: use the Open-Meteo archive API. The archive returns
  // observed weather only; precipitation_probability is a forecast-only field
  // and is null for historical dates, so we use actual precipitation instead.
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: dateStr,
      end_date: dateStr,
      daily: "weather_code,uv_index_max,precipitation_sum,rain_sum,precipitation_hours",
      hourly: "cloud_cover,precipitation",
      timezone: "Asia/Kolkata",
    });
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json();

    const dailyCode = data.daily?.weather_code?.[0] ?? null;
    const uvMax = data.daily?.uv_index_max?.[0] ?? null;

    // Observed total precipitation for the day (mm). rain_sum is the liquid
    // portion; precipitation_sum is the total (includes melted snow). We store
    // precipitation_sum as the authoritative observed amount.
    const precipitationSumMm =
      Number.isFinite(Number(data.daily?.precipitation_sum?.[0])) &&
      Number(data.daily?.precipitation_sum?.[0]) >= 0
        ? Number(data.daily?.precipitation_sum?.[0])
        : null;

    const hourlyCloud = data.hourly?.cloud_cover ?? [];

    // Average cloud cover over daylight hours (6 AM – 6 PM IST = indices 6..17)
    const daylightCloud = hourlyCloud.slice(6, 18);
    const cloudCover =
      daylightCloud.length > 0
        ? daylightCloud.reduce((s, v) => s + (v ?? 0), 0) / daylightCloud.length
        : null;

    // Deterministic 0-100 rain intensity derived from OBSERVED mm, so the
    // existing bucket/base-factor logic reflects actual (not probable) rain.
    let rainProbability = 0;
    if (precipitationSumMm !== null) {
      if (precipitationSumMm <= 0) rainProbability = 0;
      else if (precipitationSumMm < 1) rainProbability = 30;
      else if (precipitationSumMm < 5) rainProbability = 50;
      else if (precipitationSumMm < 10) rainProbability = 70;
      else rainProbability = 90;
    }

    return {
      cloudCover: cloudCover !== null ? Math.round(cloudCover * 10) / 10 : null,
      rainProbability,
      weatherCode: dailyCode,
      uvIndex: uvMax,
      precipitationSumMm,
    };
  } catch (_) {
    return null;
  }
}

/**
 * True when an existing HISTORICAL weather snapshot is stale/incomplete and
 * should be refreshed from the archive API.
 *
 * Historical snapshots written before observed-precipitation support (or by the
 * old forecast-based bug) carry `precipitation_sum_mm = NULL` and
 * `rain_probability = 0` for every day. A genuinely dry historical day instead
 * stores observed `mm = 0`, so a NULL mm unambiguously marks a stale/legacy row.
 *
 * Returns false for null rows and for any valid historical snapshot that already
 * carries observed precipitation — such rows are never rewritten on routine runs.
 */
function isStaleHistoricalSnapshot(snapshot) {
  if (!snapshot) return false;
  const mm = snapshot.precipitation_sum_mm;
  const mmMissing = mm === null || mm === undefined;
  const rain = Number(snapshot.rain_probability);
  // Explicit legacy signature: forecast-derived zero rain with no recorded mm.
  if (mmMissing && rain === 0) return true;
  // Any historical row missing observed precipitation is incomplete.
  if (mmMissing) return true;
  return false;
}

/**
 * Stores a weather snapshot for the given date. Non-fatal: logs a warning
 * on failure but does not throw.
 *
 * Returns one of: 'inserted' | 'repaired' | 'skipped' | 'unavailable' | 'failed'.
 *   - New dates (no snapshot) -> fetched and stored ('inserted').
 *   - Today/future -> never rewritten; a live snapshot is a point-in-time capture
 *     ('skipped', or 'inserted' when it did not exist yet).
 *   - Historical valid snapshot -> kept as-is ('skipped').
 *   - Historical stale/incomplete snapshot -> refreshed from observed archive
 *     precipitation ('repaired').
 */
async function collectWeatherSnapshot(dateStr, plantId, deps = {}) {
  const service = deps.archiveService || archiveService;
  const existing = service.getWeatherSnapshot(plantId, dateStr);

  const todayIst = archiveService.istDateString(new Date());
  const isTodayOrFuture = dateStr >= todayIst;

  if (existing) {
    // Live weather (today/future) is never regenerated on subsequent runs.
    if (isTodayOrFuture) return "skipped";
    // Historical: keep valid snapshots; refresh only stale/incomplete ones.
    if (!isStaleHistoricalSnapshot(existing)) return "skipped";
  }

  try {
    const weather = await fetchHistoricalWeather(dateStr, deps);
    if (!weather) {
      log(`WARN Weather snapshot unavailable for ${dateStr}`);
      return "unavailable";
    }
    service.upsertWeatherSnapshot({
      plantId,
      snapshotDate: dateStr,
      cloudCover: weather.cloudCover,
      rainProbability: weather.rainProbability,
      weatherCode: weather.weatherCode,
      uvIndex: weather.uvIndex,
      precipitationSumMm: weather.precipitationSumMm,
    });
    log(
      existing
        ? `Weather snapshot repaired for ${dateStr}`
        : `Weather snapshot stored for ${dateStr}`,
    );
    return existing ? "repaired" : "inserted";
  } catch (err) {
    log(`WARN Weather snapshot failed for ${dateStr}: ${err.message}`);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Core collection for ONE calendar day (Asia/Kolkata date string)
// ---------------------------------------------------------------------------

async function collectDate(dateStr, deps = {}) {
  const service = deps.archiveService || archiveService;
  const plantId = service.PLANT_ID();

  const session = await ensureCollectorSession(deps);

  if (!deps.skipPlantCheck) {
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
      deps,
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
      deps,
    );
    monthlyRow = (monthlyJson?.results ?? []).find((row) => Number(row.date) === dayNumber);
  } catch (err) {
    log(`WARN Monthly endpoint failed for ${dateStr}: ${err.message}`);
  }

  const monthlyValue =
    monthlyRow && Number.isFinite(Number(monthlyRow.PvProduction))
      ? Number(monthlyRow.PvProduction)
      : null;

  // --- Decide the normalized value -----------------------------------------
  // Canonical = the UTL monthly day-row scalar whenever it exists. The
  // integrated curve is demoted to a diagnostic (points_count / check_ratio).
  let generationKwh = null;
  let rawGenerationValue = null;
  let rawUnit = null;
  let source = null;
  let pointsCount = null;
  let checkMonthlyValue = null;
  let checkRatio = null;

  const integration = dailyJson ? integratePowerCurveWh(dailyJson.results) : null;
  const integratedKwh =
    integration && integration.pointsCount > 0 ? integration.wattHours / 1000 : null;

  if (monthlyValue !== null) {
    // The single scalar UTL emits for this day is authoritative: stored verbatim.
    generationKwh = monthlyValue;
    rawGenerationValue = monthlyValue;
    rawUnit = "kWh_monthly_row";
    source = "charts/monthly_row";
    checkMonthlyValue = monthlyValue;

    if (integratedKwh !== null) {
      pointsCount = integration.pointsCount;
      checkRatio = monthlyValue > 0 ? integratedKwh / monthlyValue : null;

      if (integration.cappedGap) {
        log(
          `WARN ${dateStr}: curve had a gap >${MAX_SAMPLE_GAP_MIN}min; integrated diagnostic understates.`,
        );
      }

      if (
        checkRatio !== null &&
        (checkRatio < CHECK_RATIO_WARN_LOW || checkRatio > CHECK_RATIO_WARN_HIGH)
      ) {
        log(
          `WARN ${dateStr}: integrated diagnostic ${integratedKwh.toFixed(2)} kWh vs canonical ${monthlyValue} kWh (ratio ${checkRatio.toFixed(3)}); canonical monthly row stored.`,
        );
      }
    }
  } else if (integratedKwh !== null) {
    // No upstream scalar for this date: integrate the WATT samples instead.
    generationKwh = integratedKwh;
    pointsCount = integration.pointsCount;
    source = "charts/daily_integrated";
    rawGenerationValue = integration.wattHours;
    rawUnit = "Wh_integrated_from_W_samples";

    if (integration.cappedGap) {
      log(`WARN ${dateStr}: curve had a gap >${MAX_SAMPLE_GAP_MIN}min; contribution truncated.`);
    }
  } else {
    throw new Error(`No usable data for ${dateStr}${dailyError ? ` (daily: ${dailyError})` : ""}`);
  }

  log(
    `Raw generation: ${rawGenerationValue ?? "n/a"} (${rawUnit ?? "n/a"}) | Normalized: ${generationKwh.toFixed(3)} kWh via ${source}`,
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

/** Yesterday's Asia/Kolkata calendar date, computed without host-TZ trust.
 *  Never returns the current (possibly incomplete) solar day. */
function previousCompletedIstDay(now = new Date()) {
  const today = archiveService.istDateString(now);
  const cursor = Date.parse(`${today}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  return new Date(cursor).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Canonical reconciliation (UTL day-row scalars override stored values)
// ---------------------------------------------------------------------------

/**
 * Resolves the authoritative UTL day-row scalar for every date in the list.
 * One charts/monthly request PER DISTINCT MONTH; a month that fails upstream
 * marks its dates as unresolved (null) without blocking other months.
 * Returns Map<'YYYY-MM-DD', number|null> - null means "no scalar available".
 */
async function fetchMonthlyScalars(dates, session, deps = {}) {
  const service = deps.archiveService || archiveService;
  const byDateScalar = new Map();
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();

  for (const month of months) {
    let rows = null;
    try {
      const json = await postChart(
        session,
        "monthly",
        { plant_id: Number(service.PLANT_ID()), date_parameter: month },
        deps,
      );
      rows = Array.isArray(json?.results) ? json.results : [];
    } catch (err) {
      log(`WARN Monthly endpoint failed for ${month} during reconcile: ${err.message}`);
    }

    for (const dateStr of dates.filter((d) => d.slice(0, 7) === month)) {
      if (!rows) {
        byDateScalar.set(dateStr, null);
        continue;
      }
      const row = rows.find((r) => Number(r.date) === Number(dateStr.slice(8, 10)));
      const value =
        row && Number.isFinite(Number(row.PvProduction)) ? Number(row.PvProduction) : null;
      byDateScalar.set(dateStr, value !== null && value >= 0 ? value : null);
    }
  }

  return byDateScalar;
}

/**
 * Rewrites stored daily rows so they match the authoritative UTL scalars:
 *   - value differs OR provenance is not charts/monthly_row -> rewrite
 *     verbatim from the scalar, preserving prior diagnostics (points_count,
 *     integrated-vs-scalar ratio); idempotent via the upsert equality check.
 *   - no row yet -> counted as missing (the gap-scan collects it).
 *   - UTL publishes no scalar -> row left untouched (never fabricate).
 * Safe to run any number of times; repeated runs converge to zero writes.
 */
async function reconcileCanonicalValues({ from, to }, deps = {}) {
  const service = deps.archiveService || archiveService;
  const plantId = service.PLANT_ID();
  const dates = enumerateDates(from, to);

  const summary = {
    checked: dates.length,
    corrected: 0,
    relabeled: 0,
    alreadyCanonical: 0,
    awaitingCanonical: 0,
    missing: 0,
  };
  if (dates.length === 0) return summary;

  const session = await ensureCollectorSession(deps);
  const scalars = await fetchMonthlyScalars(dates, session, deps);

  for (const dateStr of dates) {
    const scalar = scalars.get(dateStr);
    if (!Number.isFinite(scalar)) {
      // No authoritative value upstream this round: leave whatever exists.
      const existing = service
        .getDailyRecords({ date: dateStr })
        .find((r) => String(r.plant_id) === String(plantId));
      if (!existing) summary.missing++;
      else summary.awaitingCanonical++;
      continue;
    }

    const existing = service
      .getDailyRecords({ date: dateStr })
      .find((r) => String(r.plant_id) === String(plantId));

    if (!existing) {
      summary.missing++;
      continue;
    }

    const sameValue = Number(existing.generation_kwh) === scalar;
    if (sameValue && existing.source === "charts/monthly_row") {
      summary.alreadyCanonical++;
      continue;
    }

    // Preserve prior diagnostics. For legacy integrated rows the stored
    // generation_kwh WAS the integrated kWh, so integrated/scalar is exactly
    // the historical check_ratio meaning.
    const priorRatio =
      existing.check_ratio !== null && existing.check_ratio !== undefined
        ? Number(existing.check_ratio)
        : String(existing.raw_unit ?? "") === "Wh_integrated_from_W_samples" && scalar > 0
          ? Number(existing.generation_kwh) / scalar
          : null;

    service.upsertDailyGeneration({
      plantId,
      generationDate: dateStr,
      generationKwh: scalar,
      rawGenerationValue: scalar,
      rawUnit: "kWh_monthly_row",
      source: "charts/monthly_row",
      pointsCount: existing.points_count ?? null,
      checkMonthlyValue: scalar,
      checkRatio: Number.isFinite(priorRatio) ? priorRatio : null,
    });

    log(
      `RECONCILE ${dateStr}: ${existing.generation_kwh} (${existing.source}) -> ${scalar} kWh [charts/monthly_row]`,
    );
    if (sameValue) summary.relabeled++;
    else summary.corrected++;
  }

  log(
    `Canonical reconcile: checked=${summary.checked} corrected=${summary.corrected}` +
      ` relabeled=${summary.relabeled} already_canonical=${summary.alreadyCanonical}` +
      ` awaiting_scalar=${summary.awaitingCanonical} missing=${summary.missing}`,
  );

  return summary;
}

// ---------------------------------------------------------------------------
// Gap-aware scanning
// ---------------------------------------------------------------------------

/**
 * Verifies an existing solar_generation_daily row against the collector's own
 * acceptance rules:
 *   - generation_kwh present, finite, non-negative
 *   - source is one of the known provenance labels
 *   - charts/monthly_row rows hold the canonical UTL scalar and are always
 *     valid; their check_ratio is a purely diagnostic integration comparison,
 *     so it must NOT gate validity (a gappy day legitimately skews it)
 *   - charts/monthly_fallback rows already hold the UTL scalar verbatim
 *   - charts/daily_integrated rows stay valid ONLY when no monthly scalar
 *     existed at collection time; once a cross-check value is present the row
 *     predates the canonical policy and the next gap-aware scan refreshes it
 */
function isArchivedRecordValid(row) {
  if (!row) return false;

  const kwh = Number(row.generation_kwh);
  if (!Number.isFinite(kwh) || kwh < 0) return false;

  const source = String(row.source || "");
  if (source === "charts/monthly_row" || source === "charts/monthly_fallback") {
    return true;
  }
  if (source !== "charts/daily_integrated") {
    return false;
  }
  if (!(Number(row.points_count) > 0)) {
    return false;
  }

  const monthly = row.check_monthly_value;
  if (monthly !== null && monthly !== undefined && Number(monthly) > 0) {
    // UTL published a scalar for this day: refresh to the canonical value.
    return false;
  }

  return true;
}

/**
 * Required archive window [start..end]:
 *   end   = previous completed Asia/Kolkata day (never today)
 *   start = ARCHIVE_START_DATE when configured, otherwise the earliest day
 *           already present in the archive (conservative default: the
 *           collector never backfills beyond existing coverage unless the
 *           operator explicitly widens the window).
 */
function computeGapScanRange(deps = {}) {
  const service = deps.archiveService || archiveService;

  let start = null;
  const configured = (process.env.ARCHIVE_START_DATE || "").trim();
  if (configured) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(configured)) {
      start = configured;
    } else {
      log(`WARN ARCHIVE_START_DATE '${configured}' is not a valid YYYY-MM-DD date; ignoring.`);
    }
  }
  if (!start) {
    start = service.getCoverage()?.earliest ?? null;
  }

  const nowFn = typeof deps.now === "function" ? deps.now : undefined;
  const end = previousCompletedIstDay(nowFn ? nowFn() : new Date());

  return { start, end };
}

/**
 * Scheduled-mode entry point. Walks EVERY calendar date in the required
 * range chronologically, verifies what already exists, collects only what is
 * missing or inconsistent, and leaves upstream-unavailable dates untouched so
 * the next run retries them. Idempotent: safe to run any number of times.
 */
async function runGapAwareCollection({ triggerType = "gap-scan" } = {}, deps = {}) {
  const service = deps.archiveService || archiveService;
  const { start, end } = computeGapScanRange(deps);

  if (!start || start > end) {
    log(`Nothing to scan (range=${start ?? "-"}..${end}).`);
    if (!start) {
      log("Set ARCHIVE_START_DATE to enable historical backfill before the first archived day.");
    }
    const runId = service.startRun(triggerType);
    service.finishRun(runId, { status: "success", datesRequested: 0, datesStored: 0 });
    return {
      status: "success",
      range: { start, end },
      checked: 0,
      alreadyValid: 0,
      stored: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failures: [],
      remainingMissing: 0,
      coverage: service.getCoverage(),
    };
  }

  const dates = enumerateDates(start, end);

  // Repair historical rows against UTL's authoritative scalars FIRST so the
  // expensive per-day verify/refetch below only sees genuinely broken days.
  let reconciliation = null;
  try {
    reconciliation = await reconcileCanonicalValues({ from: start, to: end }, deps);
  } catch (err) {
    log(`WARN Canonical reconcile skipped this run: ${err.message}`);
  }

  const existingRows = service.getDailyRecords({ from: start, to: end });
  const byDate = new Map(existingRows.map((r) => [r.generation_date, r]));

  const missing = [];
  const stale = [];
  let alreadyValid = 0;

  for (const dateStr of dates) {
    const row = byDate.get(dateStr);
    if (!row) {
      missing.push(dateStr);
      log(`${dateStr} missing; collecting...`);
    } else if (isArchivedRecordValid(row)) {
      alreadyValid++;
      log(`${dateStr} already archived and verified; skipping.`);
    } else {
      stale.push(dateStr);
      log(`${dateStr} archived record inconsistent; refreshing...`);
    }
  }

  const collection = await runCollection([...missing, ...stale], triggerType, deps, {
    requestedCount: dates.length,
    // The scheduled path performs its own full historical-range weather pass
    // below, so stale/incomplete historical weather snapshots are repaired even
    // when no generation dates are missing or inconsistent.
    skipWeather: true,
  });

  // Best-effort weather/repair pass over the ENTIRE historical range, run only
  // after all generation records for the run have been stored. It stores
  // missing snapshots, repairs stale/legacy ones, and leaves valid snapshots
  // untouched. Never throws into the scheduled run.
  try {
    await collectWeatherForDates(dates, deps);
  } catch (_) {
    // Weather is enhancement-only; never let it affect the scheduled run.
  }

  // Ground-truth recount straight from the database: anything without a valid
  // row now is still missing, whatever happened above.
  const afterRows = service.getDailyRecords({ from: start, to: end });
  const afterByDate = new Map(afterRows.map((r) => [r.generation_date, r]));
  let remainingMissing = 0;
  for (const dateStr of dates) {
    if (!isArchivedRecordValid(afterByDate.get(dateStr))) remainingMissing++;
  }

  log("Summary:");
  log(`  range=${start}..${end}`);
  log(`  checked=${dates.length}`);
  log(`  already_valid=${alreadyValid}`);
  log(`  inserted=${collection.inserted}`);
  log(`  refreshed=${collection.updated}`);
  log(`  failed=${collection.failures.length}`);
  log(`  remaining_missing=${remainingMissing}`);

  if (remainingMissing > 0) {
    log("Unarchived dates will be retried automatically on the next run.");
  }

  return {
    ...collection,
    range: { start, end },
    checked: dates.length,
    alreadyValid,
    remainingMissing,
    reconciliation,
  };
}

/**
 * Best-effort weather snapshot collection, run as a separate pass AFTER all
 * generation records for the run have been stored. STRICTLY enhancement-only:
 * it never throws, never delays or alters generation collection/reconciliation,
 * and imposes no new required dependency on the injected services (so existing
 * partial mocks / callers are unaffected). Any unmet dependency, missing
 * service method, or network failure is swallowed and logged as a warning.
 * Inserts a small delay between network calls to avoid hammering Open-Meteo.
 */
async function collectWeatherForDates(dates, deps = {}) {
  try {
    const service = deps.archiveService || archiveService;
    // No required dependency: fall back gracefully if a mock lacks these.
    let plantId;
    try {
      plantId = typeof service.PLANT_ID === "function" ? service.PLANT_ID() : null;
    } catch (_) {
      plantId = null;
    }
    if (plantId === null || plantId === undefined) {
      log("WARN weather pass skipped (no plant id available)");
      return;
    }
    if (
      typeof service.getWeatherSnapshot !== "function" ||
      typeof service.upsertWeatherSnapshot !== "function"
    ) {
      log("WARN weather pass skipped (snapshot service unavailable)");
      return;
    }

    let stored = 0;
    for (const dateStr of dates) {
      try {
        // collectWeatherSnapshot decides whether to store, keep, or repair.
        // It never rewrites valid historical rows and never touches live rows.
        const result = await collectWeatherSnapshot(dateStr, plantId, deps);
        if (result === "inserted" || result === "repaired") stored++;
      } catch (err) {
        // Weather is enhancement-only; a failure here is non-fatal.
        log(`WARN weather snapshot failed for ${dateStr}: ${err.message}`);
      }
      // Rate limit: ~1 request per second to the weather provider.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (stored > 0) {
      log(`Weather pass: snapshots collected=${stored}`);
    }
  } catch (err) {
    // The weather pass must never abort or alter generation collection.
    log(`WARN weather pass skipped: ${err.message}`);
  }
}

async function runCollection(dates, triggerType, deps = {}, opts = {}) {
  const service = deps.archiveService || archiveService;
  const runId = service.startRun(triggerType);
  const requestedCount = opts.requestedCount ?? dates.length;

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
      log(`Leaving ${dateStr} unarchived; it will be retried on the next run.`);
    }
  }

  // Weather snapshots are enhancement-only and must never delay or block
  // generation archiving. Collect them in a separate, best-effort pass that
  // runs only after all generation records have been stored.
  // The scheduled (gap-aware) path passes skipWeather and performs its own, full
  // historical-range weather pass so stale snapshots get repaired even when no
  // generation dates are missing.
  if (!opts.skipWeather) {
    try {
      await collectWeatherForDates(dates, deps);
    } catch (_) {
      // Never let weather collection affect generation results.
    }
  }

  const status = failures.length === 0 ? "success" : stored > 0 ? "partial" : "failed";

  service.finishRun(runId, {
    status,
    datesRequested: requestedCount,
    datesStored: stored,
    error: failures.length ? JSON.stringify(failures) : null,
  });

  const coverage = service.getCoverage();
  log("Collection completed.");
  log(
    `Summary: requested=${requestedCount} stored=${stored} (new=${inserted} refreshed=${updated} unchanged=${unchanged}) failed=${failures.length}`,
  );
  log(
    `Coverage: ${coverage.earliest ?? "-"} .. ${coverage.latest ?? "-"} (${coverage.daysArchived} days)`,
  );

  return { status, stored, inserted, updated, unchanged, failures, coverage };
}

module.exports = {
  integratePowerCurveWh,
  ensureCollectorSession,
  collectDate,
  enumerateDates,
  runCollection,
  runGapAwareCollection,
  computeGapScanRange,
  isArchivedRecordValid,
  previousCompletedIstDay,
  reconcileCanonicalValues,
  fetchMonthlyScalars,
  fetchHistoricalWeather,
  isStaleHistoricalSnapshot,
  collectWeatherSnapshot,
  collectWeatherForDates,
  COLLECTOR_SESSION_KEY,
};
