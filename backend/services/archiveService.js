const { getArchiveDb } = require("../data/archiveDatabase");

const PLANT_ID = () => String(process.env.ARCHIVE_PLANT_ID || "105717");

// ---------------------------------------------------------------------------
// Prepared statements (all parameterized; no string-built SQL anywhere).
// ---------------------------------------------------------------------------

let stmts = null;

function statements() {
  if (stmts) return stmts;
  const db = getArchiveDb();

  const UPSERT = `
    INSERT INTO solar_generation_daily (
      plant_id, generation_date, generation_kwh,
      raw_generation_value, raw_unit, source,
      points_count, check_monthly_value, check_ratio,
      collected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plant_id, generation_date) DO UPDATE SET
      generation_kwh       = excluded.generation_kwh,
      raw_generation_value = excluded.raw_generation_value,
      raw_unit             = excluded.raw_unit,
      source               = excluded.source,
      points_count         = excluded.points_count,
      check_monthly_value  = excluded.check_monthly_value,
      check_ratio          = excluded.check_ratio,
      updated_at           = excluded.updated_at
      -- collected_at deliberately preserved: first-seen time survives re-runs.
  `;

  const SELECT_BY_DATE = `
    SELECT * FROM solar_generation_daily
    WHERE plant_id = ? AND generation_date = ?
  `;

  stmts = {
    db,
    upsert: db.prepare(UPSERT),
    selectByDate: db.prepare(SELECT_BY_DATE),
    selectRange: db.prepare(`
      SELECT * FROM solar_generation_daily
      WHERE plant_id = ? AND generation_date >= ? AND generation_date <= ?
      ORDER BY generation_date ASC
    `),
    selectAllForPlant: db.prepare(`
      SELECT * FROM solar_generation_daily
      WHERE plant_id = ?
      ORDER BY generation_date ASC
    `),
    selectMonthly: db.prepare(`
      SELECT substr(generation_date, 1, 7) AS month,
             SUM(generation_kwh)           AS generation_kwh,
             COUNT(*)                      AS days_reported,
             MIN(generation_kwh)           AS min_day_kwh,
             MAX(generation_kwh)           AS max_day_kwh
      FROM solar_generation_daily
      WHERE plant_id = ? AND substr(generation_date, 1, 7) = ?
      GROUP BY month
    `),
    selectYearly: db.prepare(`
      SELECT substr(generation_date, 1, 4) AS year,
             SUM(generation_kwh)           AS generation_kwh,
             COUNT(*)                      AS days_reported
      FROM solar_generation_daily
      WHERE plant_id = ? AND substr(generation_date, 1, 4) = ?
      GROUP BY year
    `),
    selectLifetime: db.prepare(`
      SELECT plant_id,
             SUM(generation_kwh) AS generation_kwh,
             COUNT(*)            AS days_reported,
             MIN(generation_date) AS first_day,
             MAX(generation_date) AS last_day
      FROM solar_generation_daily
      WHERE plant_id = ?
      GROUP BY plant_id
    `),
    coverage: db.prepare(`
      SELECT MIN(generation_date) AS earliest,
             MAX(generation_date) AS latest,
             COUNT(*)             AS days_archived
      FROM solar_generation_daily
      WHERE plant_id = ?
    `),
    latestDate: db.prepare(`
      SELECT MAX(generation_date) AS latest FROM solar_generation_daily
      WHERE plant_id = ?
    `),
    hasDate: db.prepare(`
      SELECT 1 FROM solar_generation_daily
      WHERE plant_id = ? AND generation_date = ?
    `),
    curveUpsert: db.prepare(`
      INSERT INTO solar_power_curve (
        plant_id, generation_date, points_count, raw_payload,
        collected_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(plant_id, generation_date) DO UPDATE SET
        points_count = excluded.points_count,
        raw_payload  = excluded.raw_payload,
        updated_at   = excluded.updated_at
        -- collected_at deliberately preserved on conflict.
    `),
    runInsert: db.prepare(`
      INSERT INTO archive_runs (trigger_type, started_at)
      VALUES (?, ?)
    `),
    runFinish: db.prepare(`
      UPDATE archive_runs SET
        finished_at = ?, status = ?,
        dates_requested = ?, dates_stored = ?, error_text = ?
      WHERE id = ?
    `),
    lastSuccessfulRun: db.prepare(`
      SELECT * FROM archive_runs
      WHERE status = 'success'
      ORDER BY started_at DESC LIMIT 1
    `),
    // --- Weather snapshot statements ---
    weatherUpsert: db.prepare(`
      INSERT INTO daily_weather_snapshot (
        plant_id, snapshot_date, cloud_cover, rain_probability,
        weather_code, uv_index, precipitation_sum_mm, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(plant_id, snapshot_date) DO UPDATE SET
        cloud_cover          = excluded.cloud_cover,
        rain_probability     = excluded.rain_probability,
        weather_code         = excluded.weather_code,
        uv_index             = excluded.uv_index,
        precipitation_sum_mm = excluded.precipitation_sum_mm
    `),
    weatherSelectByDate: db.prepare(`
      SELECT * FROM daily_weather_snapshot
      WHERE plant_id = ? AND snapshot_date = ?
    `),
    weatherSelectRange: db.prepare(`
      SELECT * FROM daily_weather_snapshot
      WHERE plant_id = ? AND snapshot_date >= ? AND snapshot_date <= ?
      ORDER BY snapshot_date ASC
    `),
    weatherSelectAll: db.prepare(`
      SELECT * FROM daily_weather_snapshot
      WHERE plant_id = ?
      ORDER BY snapshot_date ASC
    `),
    weatherCountByBucket: db.prepare(`
      SELECT w.cloud_cover, w.rain_probability, w.weather_code, w.uv_index,
             g.generation_kwh, g.generation_date
      FROM daily_weather_snapshot w
      JOIN solar_generation_daily g
        ON w.plant_id = g.plant_id AND w.snapshot_date = g.generation_date
      WHERE w.plant_id = ? AND w.snapshot_date >= ? AND w.snapshot_date <= ?
    `),
    // Correction model source: every completed historical (weather, generation)
    // pair, exposing the canonical generation fields so the model learns from
    // the authoritative UTL scalar, not the possibly-integrated generation_kwh.
    weatherGenJoin: db.prepare(`
      SELECT w.snapshot_date, w.cloud_cover, w.rain_probability, w.weather_code,
             w.uv_index, w.precipitation_sum_mm,
             g.generation_date, g.generation_kwh,
             g.check_monthly_value, g.raw_generation_value, g.raw_unit, g.source
      FROM daily_weather_snapshot w
      JOIN solar_generation_daily g
        ON w.plant_id = g.plant_id AND w.snapshot_date = g.generation_date
      WHERE w.plant_id = ?
    `),
  };

  return stmts;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Idempotent upsert of one daily record. Returns:
 *   { result: 'inserted' | 'updated' | 'unchanged', row }
 * A re-run with identical values leaves collected_at untouched and reports
 * 'unchanged' so callers can prove idempotency in logs/tests.
 */
function upsertDailyGeneration(record) {
  const s = statements();
  const now = Date.now();

  const existing = s.selectByDate.get(record.plantId, record.generationDate);

  if (existing) {
    const same =
      existing.generation_kwh === record.generationKwh &&
      existing.raw_generation_value === record.rawGenerationValue &&
      existing.raw_unit === record.rawUnit &&
      existing.source === record.source &&
      existing.points_count === (record.pointsCount ?? null) &&
      existing.check_monthly_value === (record.checkMonthlyValue ?? null) &&
      existing.check_ratio === (record.checkRatio ?? null);

    if (same) return { result: "unchanged", row: existing };
  }

  s.upsert.run(
    record.plantId,
    record.generationDate,
    record.generationKwh,
    record.rawGenerationValue,
    record.rawUnit,
    record.source,
    record.pointsCount ?? null,
    record.checkMonthlyValue ?? null,
    record.checkRatio ?? null,
    existing ? existing.collected_at : now,
    now,
  );

  const row = s.selectByDate.get(record.plantId, record.generationDate);
  return { result: existing ? "updated" : "inserted", row };
}

function storePowerCurve({ plantId, generationDate, pointsCount, payload }) {
  const s = statements();
  const now = Date.now();
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);

  s.curveUpsert.run(plantId, generationDate, pointsCount, json, now, now);
}

// ---------------------------------------------------------------------------
// Weather snapshots (for prediction correction model)
// ---------------------------------------------------------------------------

function upsertWeatherSnapshot({
  plantId,
  snapshotDate,
  cloudCover,
  rainProbability,
  weatherCode,
  uvIndex,
  precipitationSumMm,
}) {
  const s = statements();
  s.weatherUpsert.run(
    plantId,
    snapshotDate,
    cloudCover ?? null,
    rainProbability ?? null,
    weatherCode ?? null,
    uvIndex ?? null,
    Number.isFinite(Number(precipitationSumMm)) ? Number(precipitationSumMm) : null,
    Date.now(),
  );
  return s.weatherSelectByDate.get(plantId, snapshotDate);
}

function getWeatherSnapshot(plantId, date) {
  return statements().weatherSelectByDate.get(plantId, date) || null;
}

function getWeatherSnapshots({ from, to } = {}) {
  const s = statements();
  const pid = PLANT_ID();
  if (!from && !to) return s.weatherSelectAll.all(pid);
  return s.weatherSelectRange.all(pid, from, to);
}

/**
 * Maps raw weather values to a discrete bucket signature string.
 * Two days with similar weather get the same signature, enabling
 * residual-based correction of the base prediction.
 */
function computeWeatherBucket(cloudCover, rainProbability, weatherCode, uvIndex) {
  const cloud =
    cloudCover >= 80
      ? "overcast"
      : cloudCover >= 50
        ? "mostly"
        : cloudCover >= 20
          ? "partly"
          : "clear";
  const rain =
    rainProbability >= 90
      ? "rainy"
      : rainProbability >= 60
        ? "likely"
        : rainProbability >= 30
          ? "unlikely"
          : "dry";
  const code = [61, 63, 65, 80, 81, 82].includes(weatherCode)
    ? "rain"
    : [95, 96, 99].includes(weatherCode)
      ? "thunder"
      : weatherCode === 3
        ? "overcast"
        : "clear";
  const uv = uvIndex >= 9 ? "extreme" : uvIndex >= 6 ? "high" : uvIndex >= 3 ? "moderate" : "low";
  return `${cloud}|${rain}|${code}|${uv}`;
}

/**
 * Reproduces the weather-factor portion of predictDailyEnergy() using only
 * the weather inputs (monthAverage effectively = 1). This gives the base
 * ratio that the deterministic algorithm would assign for a given weather
 * signature, so we can compare it against what actually happened.
 */
function baseWeatherFactor(cloudCover, rainProbability, weatherCode, uvIndex) {
  let f = 1;
  if (cloudCover >= 80) f -= 0.2;
  else if (cloudCover >= 60) f -= 0.12;
  else if (cloudCover >= 40) f -= 0.07;
  else if (cloudCover >= 20) f -= 0.03;

  if (rainProbability >= 90) f -= 0.12;
  else if (rainProbability >= 70) f -= 0.08;
  else if (rainProbability >= 50) f -= 0.04;

  if (weatherCode === 3) f -= 0.08;
  else if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) f -= 0.15;
  else if ([95, 96, 99].includes(weatherCode)) f -= 0.22;

  if (uvIndex >= 9) f += 0.03;
  else if (uvIndex < 3) f -= 0.05;

  return Math.max(0.6, Math.min(1.05, f));
}

/**
 * Returns the authoritative/canonical daily generation (kWh) for a stored row.
 *
 * Priority:
 *   1. check_monthly_value   - the UTL monthly day-row scalar (authoritative)
 *   2. raw_generation_value  - the UTL scalar when raw_unit is kWh_monthly_row
 *                              (a Wh-integrated legacy value is NOT usable here)
 *   3. generation_kwh        - final fallback (integrated/whatever was stored)
 *
 * This prevents Aug 21/22 style legacy integrated values (generation_kwh = the
 * trapezoid Wh/1000) from contaminating the learned correction: those rows now
 * carry their canonical scalar in check_monthly_value / raw_generation_value.
 */
function canonicalGeneration(row) {
  const check = Number(row && row.check_monthly_value);
  if (Number.isFinite(check) && check > 0) return check;

  if (row && String(row.raw_unit) === "kWh_monthly_row") {
    const raw = Number(row.raw_generation_value);
    if (Number.isFinite(raw) && raw > 0) return raw;
  }

  const gen = Number(row && row.generation_kwh);
  return Number.isFinite(gen) && gen > 0 ? gen : null;
}

// ---------------------------------------------------------------------------
// Continuous weather similarity (replaces sparse exact-bucket matching)
// ---------------------------------------------------------------------------

/** Folds a WMO weather code into a 0..1 "inclement-ness" severity. */
function codeSeverity(code) {
  if ([95, 96, 99].includes(code)) return 1.0; // thunderstorm
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 0.8; // rain
  if (code === 3) return 0.35; // overcast
  if (code === 2) return 0.15; // partly cloudy
  return 0; // clear/other
}

/**
 * Normalizes a training history row's weather into a feature vector.
 * Missing values fall back to neutral so a null UV (historical archive has
 * none) does not zero-out the similarity.
 */
function weatherFeatures({ cloud_cover, rain_probability, weather_code, uv_index }) {
  const cloud = Number.isFinite(Number(cloud_cover)) ? Number(cloud_cover) / 100 : 0.3;
  const rain = Number.isFinite(Number(rain_probability)) ? Number(rain_probability) / 100 : 0.2;
  const code = Number.isFinite(Number(weather_code)) ? codeSeverity(Number(weather_code)) : 0.2;
  const uv = Number.isFinite(Number(uv_index))
    ? Math.max(0, Math.min(1, Number(uv_index) / 10))
    : 0.5;
  return { cloud, rain, code, uv };
}

/**
 * Radial-basis similarity in [0,1] between two normalized weather vectors.
 * sigma is per-dimension; close weather gets weight near 1, dissimilar near 0.
 * UV contributes little because it is often null historically.
 */
function weatherSimilarity(a, b) {
  const sigmas = { cloud: 0.28, rain: 0.3, code: 0.35, uv: 0.5 };
  let s = 0;
  let dims = 0;
  for (const k of Object.keys(sigmas)) {
    const d = Math.abs(a[k] - b[k]);
    s += Math.exp(-(d * d) / (2 * sigmas[k] * sigmas[k]));
    dims++;
  }
  return s / dims;
}

/**
 * Computes the historical correction for a target date and weather.
 *
 * The correction is a similarity- and recency-weighted mean of a WEATHER-NORMALIZED
 * MULTIPLICATIVE residual
 *     residual_r = canonicalGen_r / (B_r * WF_r) - 1
 * over every COMPLETED historical day strictly BEFORE targetDate. Here:
 *   - canonicalGen_r = the authoritative daily generation (check_monthly_value first)
 *   - WF_r           = baseWeatherFactor(the row's own weather)
 *   - B_r            = self-excluding historical month average for the row's month
 *                      (completed days < targetDate, minus the row itself), the same
 *                      "average of completed historical days" concept the prediction
 *                      base uses. This keeps base and residual on ONE baseline.
 *
 * The residual therefore represents how the plant performed RELATIVE TO what the
 * deterministic weather model (B_r * WF_r) expected, which is exactly what a learned
 * correction should capture: a weather-independent efficiency offset (positive =
 * plant outperforms its weather penalty, negative = underperforms). A weather-
 * independent plant (gen == B_r for all weather) yields residual ~ 0 rather than a
 * spurious positive value.
 *
 * The whole set is gated by `snapshot_date < targetDate` so neither today's
 * partial generation nor any future row can leak into the target's own forecast.
 *
 * Safeguards:
 *   - only canonical generation is used (check_monthly_value first)
 *   - target-date leak impossible (date < targetDate enforced)
 *   - partial-day generation never eligible (its date == targetDate is excluded)
 *   - missing weather / invalid generation are skipped
 *   - duplicates cannot exist (UNIQUE(plant_id,date))
 *   - extreme residuals are clipped to a robust band before weighting
 *   - falls back to 0 (base prediction stands) when evidence is too thin
 *
 * Returns:
 *   { correctionFactor, sampleSize, effectiveSample, confidence, bucket }
 *   correctionFactor in [-0.15, +0.15]; add as final = base * (1 + factor).
 */
function getCorrectionFactor({
  cloudCover,
  rainProbability,
  weatherCode,
  uvIndex,
  targetDate,
} = {}) {
  const s = statements();
  const pid = PLANT_ID();

  const bucket = computeWeatherBucket(cloudCover, rainProbability, weatherCode, uvIndex);
  const bf = baseWeatherFactor(cloudCover, rainProbability, weatherCode, uvIndex);
  const target = weatherFeatures({
    cloud_cover: cloudCover,
    rain_probability: rainProbability,
    weather_code: weatherCode,
    uv_index: uvIndex,
  });

  const rows = s.weatherGenJoin.all(pid);

  // Collect eligible COMPLETED history strictly before the target date, with the
  // deterministic weather factor (WF_r) for each row and its canonical generation.
  const eligible = [];
  for (const row of rows) {
    // Leak gate: only completed history strictly before the target date.
    if (targetDate && row.snapshot_date >= targetDate) continue;
    const gen = canonicalGeneration(row);
    if (gen === null) continue;
    if (row.cloud_cover == null && row.rain_probability == null && row.weather_code == null) {
      continue; // no usable weather history
    }
    const WF = baseWeatherFactor(
      row.cloud_cover,
      row.rain_probability,
      row.weather_code,
      row.uv_index,
    );
    if (!Number.isFinite(WF) || WF <= 0) continue;
    eligible.push({ row, gen, month: row.snapshot_date.slice(0, 7), WF });
  }

  // WEATHER-NORMALIZED baseline. The deterministic base is "B * WF" (see
  // predictionService.predictDailyEnergy). To isolate how the plant performed
  // RELATIVE TO that weather model we back each day out to its
  // weather-neutral equivalent (gen / WF) and average those. A plant that
  // simply follows its own stable output (gen = B * WF, or that ignores
  // weather entirely, gen = constant) therefore yields residual ~ 0, instead
  // of the spurious large positive value the old plain-monthly-average baseline
  // produced. The baseline is self-excluding per training row to avoid the
  // row influencing its own residual (FIX B).
  const wfNormalized = eligible.map((e) => e.gen / e.WF);
  const wfSum = wfNormalized.reduce((s, v) => s + v, 0);

  // Global weather-normalized baseline B = mean(gen_r / WF_r) over the eligible
  // completed history. predictForDate uses this as the base month-average so the
  // base (B * WF_target) and the residual (gen / (B * WF_r)) share ONE baseline.
  const baselineB = wfSum / Math.max(1, eligible.length);

  const residuals = [];
  for (let i = 0; i < eligible.length; i++) {
    const e = eligible[i];
    // baselineRow = self-excluding weather-normalized average for THIS row
    // (B_r, excluding the row's own gen/WF to avoid self-influence).
    const baselineRow =
      eligible.length > 1 ? (wfSum - wfNormalized[i]) / (eligible.length - 1) : wfNormalized[i];
    if (!Number.isFinite(baselineRow) || baselineRow <= 0) continue;

    // Weather-normalized MULTIPLICATIVE residual:
    //   residual_r = gen_r / (B * WF_r) - 1
    // > 0 => the plant outperformed the deterministic weather model for that day;
    // < 0 => it underperformed. This is exactly the learned signal we want.
    let residual = e.gen / (baselineRow * e.WF) - 1;
    // Robust clip: ignore freak outliers (e.g. partial maintenance day) beyond
    // a sane relative band so one rogue row cannot drag the whole correction.
    if (residual > 0.35) residual = 0.35;
    if (residual < -0.35) residual = -0.35;

    const feats = weatherFeatures(e.row);
    const sim = weatherSimilarity(target, feats);
    const ageDays = targetDate
      ? (Date.parse(targetDate) - Date.parse(e.row.snapshot_date)) / 86400000
      : 0;
    const recency = Math.exp(-Math.max(0, ageDays) / 45); // ~45-day half-life
    residuals.push({ residual, sim, recency, WF: e.WF, row: e.row });
  }

  if (residuals.length === 0) {
    return {
      correctionFactor: 0,
      sampleSize: 0,
      effectiveSample: 0,
      confidence: "none",
      bucket,
      baseline: Number(baselineB.toFixed(4)),
    };
  }

  const totalWeight = residuals.reduce((sum, r) => sum + r.sim * r.recency, 0);
  if (totalWeight <= 0) {
    return {
      correctionFactor: 0,
      sampleSize: residuals.length,
      effectiveSample: 0,
      confidence: "none",
      bucket,
      baseline: Number(baselineB.toFixed(4)),
    };
  }

  let weighted = 0;
  for (const r of residuals) weighted += r.residual * (r.sim * r.recency);
  const raw = weighted / totalWeight;
  const correctionFactor = Number(Math.max(-0.15, Math.min(0.15, raw)).toFixed(4));

  const effectiveSample = Number(totalWeight.toFixed(2));
  let confidence = "low";
  if (effectiveSample >= 8) confidence = "high";
  else if (effectiveSample >= 3) confidence = "medium";

  // Conservative: when the weighted evidence is too thin, do not force a
  // correction - base prediction stands (but the baseline is still the base).
  if (effectiveSample < 1.5) {
    return {
      correctionFactor: 0,
      sampleSize: residuals.length,
      effectiveSample,
      confidence: "none",
      bucket,
      baseline: Number(baselineB.toFixed(4)),
    };
  }

  return {
    correctionFactor,
    sampleSize: residuals.length,
    effectiveSample,
    confidence,
    bucket,
    baseline: Number(baselineB.toFixed(4)),
  };
}

function startRun(triggerType) {
  const info = statements().runInsert.run(triggerType, Date.now());
  return Number(info.lastInsertRowid);
}

function finishRun(runId, { status, datesRequested, datesStored, error }) {
  statements().runFinish.run(
    Date.now(),
    status,
    datesRequested ?? 0,
    datesStored ?? 0,
    error ?? null,
    runId,
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function getDailyRecords({ date, from, to } = {}) {
  const s = statements();
  if (date) return s.selectByDate.all(PLANT_ID(), date);
  // No filter at all must NOT fall through to selectRange with undefined
  // binds (better-sqlite3 throws) - callers legitimately request full history.
  if (!from && !to) return s.selectAllForPlant.all(PLANT_ID());
  return s.selectRange.all(PLANT_ID(), from, to);
}

function getMonthlyTotal(month) {
  return statements().selectMonthly.get(PLANT_ID(), month) || null;
}

function getYearlyTotal(year) {
  return statements().selectYearly.get(PLANT_ID(), year) || null;
}

function getLifetimeTotal() {
  return statements().selectLifetime.get(PLANT_ID()) || null;
}

function getCoverage() {
  const cov = statements().coverage.get(PLANT_ID());
  const lastRun = statements().lastSuccessfulRun.get() || null;
  const todayIst = istDateString(new Date());
  const yesterdayIst = istDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  return {
    plantId: PLANT_ID(),
    earliest: cov?.earliest ?? null,
    latest: cov?.latest ?? null,
    daysArchived: cov?.days_archived ?? 0,
    lastSuccessfulCollection: lastRun
      ? {
          at: new Date(lastRun.finished_at ?? lastRun.started_at).toISOString(),
          triggerType: lastRun.trigger_type,
          datesRequested: lastRun.dates_requested,
          datesStored: lastRun.dates_stored,
        }
      : null,
    hasToday: !!statements().hasDate.get(PLANT_ID(), todayIst),
    hasYesterday: !!statements().hasDate.get(PLANT_ID(), yesterdayIst),
  };
}

function getLatestArchivedDate() {
  const row = statements().latestDate.get(PLANT_ID());
  return row?.latest ?? null;
}

// ---------------------------------------------------------------------------
// Timezone helper (single source of truth for IST calendar math)
// ---------------------------------------------------------------------------

const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Formats an instant as the Asia/Kolkata calendar date 'YYYY-MM-DD'. */
function istDateString(instant) {
  return IST_FORMATTER.format(instant instanceof Date ? instant : new Date(instant));
}

module.exports = {
  PLANT_ID,
  upsertDailyGeneration,
  storePowerCurve,
  startRun,
  finishRun,
  getDailyRecords,
  getMonthlyTotal,
  getYearlyTotal,
  getLifetimeTotal,
  getCoverage,
  getLatestArchivedDate,
  istDateString,
  upsertWeatherSnapshot,
  getWeatherSnapshot,
  getWeatherSnapshots,
  computeWeatherBucket,
  baseWeatherFactor,
  getCorrectionFactor,
};
