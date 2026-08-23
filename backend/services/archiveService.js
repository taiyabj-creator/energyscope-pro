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
    now
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
    runId
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function getDailyRecords({ date, from, to } = {}) {
  const s = statements();
  if (date) return s.selectByDate.all(PLANT_ID(), date);
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
};
