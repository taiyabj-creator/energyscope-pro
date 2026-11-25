/**
 * Plant records & milestones, computed from the canonical EnergyScope Archive.
 *
 * Everything here is derived on read from `archiveService`'s canonical helpers
 * (`getCanonicalDays`, `getPowerCurves`) - never from a second SQL aggregate and
 * never from the raw `generation_kwh` column. Because the computation happens
 * on every request, records update automatically as the collector archives new
 * days; there is no separate maintenance job and no stored record state to drift.
 *
 * Definitions (all documented in the API response so clients can state them):
 *   - Highest day       : max canonical daily generation; earliest date wins ties.
 *   - Highest month     : max canonical monthly total. `complete` is true only
 *                         when every calendar day of that month has a row.
 *   - Peak power        : max `PvProduction` sample (W) across the stored
 *                         intraday curves - the only historical power source.
 *   - Milestones        : 1 / 5 / 10 MWh. The FIRST milestone date is estimated
 *                         because the plant produced energy before archive
 *                         coverage began (the logger's lifetime counter is ahead
 *                         of the archive by that pre-coverage gap). Subtracting
 *                         the gap from 1,000 kWh gives the archive cumulative
 *                         that corresponds to the plant's true first 1 MWh, and
 *                         the archive crossing of that value dates it. It is
 *                         returned with `estimated: true`. Later milestones use
 *                         actual canonical archive crossings with no offset.
 *   - Streaks           : consecutive calendar days with canonical generation
 *                         > 0. A missing day, an inverter-off day or a zero
 *                         breaks the run.
 *   - Best month        : highest average kWh/day among months with at least
 *                         MIN_DAYS_FOR_AVERAGE_DAYS archived days (fairer than
 *                         the raw total for a partially archived month).
 *   - Best year         : highest annual total; `complete` flags full coverage.
 *   - Record-breaking   : days that beat every earlier archived day. The first
 *                         archived day establishes the baseline, not a record.
 */
const archiveService = require("./archiveService");
const benefitsService = require("./benefitsService");

const MILESTONES = [
  { kwh: 1_000, label: "1 MWh" },
  { kwh: 5_000, label: "5 MWh" },
  { kwh: 10_000, label: "10 MWh" },
];

// Only the first milestone gets the pre-coverage offset treatment: it is the one
// the plant provably reached before the archive existed (the logger counter is
// already past it), so an archive-only date would be wrong by the whole gap.
const FIRST_MILESTONE_KWH = MILESTONES[0].kwh;

// A month needs at least this many archived days before its daily average is
// allowed to compete for "best month", so a 3-day month cannot win on luck.
const MIN_DAYS_FOR_AVERAGE_DAYS = 5;

// Parsing every stored curve is the expensive part; the peak only changes when
// the collector stores a new/updated curve, so cache it behind a cheap
// fingerprint (row count + newest date + newest updated_at).
const POWER_CACHE_TTL_MS = 5 * 60 * 1000;
let powerCache = { fingerprint: null, computedAt: 0, value: null };

const DAY_MS = 24 * 60 * 60 * 1000;

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

const dayKey = (date) => Date.parse(`${date}T00:00:00Z`);
const nextDay = (date) => new Date(dayKey(date) + DAY_MS).toISOString().slice(0, 10);

function daysInMonth(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return 0;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function daysInYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

/** Max sample in the stored intraday curves, or null when none are stored. */
function computeHighestPower() {
  const curves = archiveService.getPowerCurves();
  if (curves.length === 0) return null;

  const fingerprint = `${curves.length}:${curves[0].generation_date}:${
    curves[curves.length - 1].generation_date
  }:${curves.reduce((max, curve) => Math.max(max, Number(curve.updated_at) || 0), 0)}`;

  const now = Date.now();
  if (
    powerCache.value &&
    powerCache.fingerprint === fingerprint &&
    now - powerCache.computedAt < POWER_CACHE_TTL_MS
  ) {
    return powerCache.value;
  }

  let best = null;
  for (const curve of curves) {
    let payload;
    try {
      payload = JSON.parse(curve.raw_payload);
    } catch {
      continue;
    }

    const samples = Array.isArray(payload?.results) ? payload.results : [];
    for (const sample of samples) {
      const watts = Number(sample?.PvProduction);
      const minutes = Number(sample?.timeMinutes);
      if (!Number.isFinite(watts) || watts <= 0) continue;
      if (!best || watts > best.watts) {
        best = {
          date: curve.generation_date,
          watts,
          timeMinutes: Number.isFinite(minutes) ? Math.round(minutes) : null,
        };
      }
    }
  }

  const value = best
    ? {
        date: best.date,
        watts: round1(best.watts),
        time_minutes: best.timeMinutes,
        curve_days: curves.length,
      }
    : null;

  powerCache = { fingerprint, computedAt: now, value };
  return value;
}

function computeHighestDay(days) {
  let best = null;
  for (const day of days) {
    if (day.kwh === null || day.kwh <= 0) continue;
    if (!best || day.kwh > best.kwh) best = day;
  }
  return best ? { date: best.date, kwh: round2(best.kwh) } : null;
}

function bucketMonths(days) {
  const buckets = new Map();

  for (const day of days) {
    const month = day.date.slice(0, 7);
    let bucket = buckets.get(month);
    if (!bucket) {
      bucket = {
        month,
        kwh: 0,
        daysArchived: 0,
        daysReported: 0,
        daysExpected: daysInMonth(month),
      };
      buckets.set(month, bucket);
    }
    // An inverter-off day is a known zero: it completes the month without
    // adding generation. An unusable row (neither measured nor inverter-off)
    // stays archived but is not counted as a reported day.
    bucket.daysArchived += 1;
    if (day.kwh !== null) {
      bucket.kwh += day.kwh;
      bucket.daysReported += 1;
    }
  }

  return [...buckets.values()].map((bucket) => ({
    month: bucket.month,
    kwh: round2(bucket.kwh),
    days_reported: bucket.daysReported,
    days_expected: bucket.daysExpected,
    complete: bucket.daysArchived === bucket.daysExpected,
    average_kwh: bucket.daysArchived > 0 ? round2(bucket.kwh / bucket.daysArchived) : null,
  }));
}

function computeHighestMonth(months) {
  let best = null;
  for (const month of months) {
    if (!best || month.kwh > best.kwh) best = month;
  }
  if (!best) return null;
  return {
    month: best.month,
    kwh: best.kwh,
    days_reported: best.days_reported,
    days_expected: best.days_expected,
    complete: best.complete,
  };
}

function computeBestMonth(months) {
  let best = null;
  for (const month of months) {
    if (month.average_kwh === null || month.days_reported < MIN_DAYS_FOR_AVERAGE_DAYS) continue;
    if (!best || month.average_kwh > best.average_kwh) best = month;
  }
  if (!best) return null;
  return {
    month: best.month,
    kwh: best.kwh,
    average_kwh: best.average_kwh,
    days_reported: best.days_reported,
    days_expected: best.days_expected,
    complete: best.complete,
  };
}

function bucketYears(days) {
  const buckets = new Map();

  for (const day of days) {
    const year = day.date.slice(0, 4);
    let bucket = buckets.get(year);
    if (!bucket) {
      bucket = {
        year,
        kwh: 0,
        daysArchived: 0,
        daysReported: 0,
        daysExpected: daysInYear(year),
      };
      buckets.set(year, bucket);
    }
    bucket.daysArchived += 1;
    if (day.kwh !== null) {
      bucket.kwh += day.kwh;
      bucket.daysReported += 1;
    }
  }

  return [...buckets.values()].map((bucket) => ({
    year: bucket.year,
    kwh: round2(bucket.kwh),
    days_reported: bucket.daysReported,
    days_expected: bucket.daysExpected,
    complete: bucket.daysArchived === bucket.daysExpected,
  }));
}

function computeBestYear(years) {
  let best = null;
  for (const year of years) {
    if (!best || year.kwh > best.kwh) best = year;
  }
  return best
    ? {
        year: best.year,
        kwh: best.kwh,
        days_reported: best.days_reported,
        days_expected: best.days_expected,
        complete: best.complete,
      }
    : null;
}

/**
 * Milestones with the pre-coverage offset applied ONLY to the first threshold.
 *
 * The plant was generating before the archive existed, so its lifetime counter
 * is ahead of archived generation by `preCoverageKwh`. The true first 1 MWh was
 * therefore reached when the ARCHIVE cumulative reached
 * `1000 - preCoverageKwh`; the first archived day crossing that target dates the
 * milestone, and the item is marked `estimated: true` with the audit numbers.
 * Every later threshold uses the plain archived crossing with no offset.
 */
function computeMilestones(
  days,
  { coverageStart, lifetimeKwh, lifetimeSource, archiveTotalKwh, archiveComplete },
) {
  const checkpoints = [];
  let cumulative = 0;

  for (const day of days) {
    if (day.kwh === null) continue;
    checkpoints.push({ date: day.date, before: cumulative, dayKwh: day.kwh });
    cumulative += day.kwh;
  }

  // The gap between the logger's lifetime counter and the archive total is only
  // a PRE-COVERAGE gap when the archive has no missing days: any hole would make
  // part of that difference archived-but-unrecorded energy, and subtracting it
  // would fabricate a "reached before coverage" claim. Incomplete coverage
  // therefore falls back to the plain archive crossing.
  const preCoverageKwh =
    archiveComplete && lifetimeSource === "utl_logger" && lifetimeKwh > archiveTotalKwh
      ? round2(lifetimeKwh - archiveTotalKwh)
      : 0;

  // Progress follows the same basis as the dates: real lifetime output when the
  // pre-coverage gap is accounted for (so "40% to 5 MWh" describes the plant),
  // otherwise the archived total (so progress and archive crossings agree).
  const progressBase = preCoverageKwh > 0 ? lifetimeKwh : archiveTotalKwh;

  function crossing(targetKwh) {
    for (const point of checkpoints) {
      if (point.before + point.dayKwh >= targetKwh) return point;
    }
    return null;
  }

  const items = MILESTONES.map((milestone) => {
    const progressPct = round1(Math.min(100, (progressBase / milestone.kwh) * 100));
    const isFirst = milestone.kwh === FIRST_MILESTONE_KWH;

    if (isFirst && preCoverageKwh > 0) {
      const target = round2(milestone.kwh - preCoverageKwh);

      if (target <= 0) {
        // The plant crossed this threshold before coverage began; no archived
        // day can date it, so the date stays null rather than being invented.
        return {
          threshold_kwh: milestone.kwh,
          label: milestone.label,
          achieved_on: null,
          estimated: true,
          basis: "estimated_pre_coverage_offset",
          achieved_before_coverage: true,
          offset_kwh: preCoverageKwh,
          progress_pct: progressPct,
        };
      }

      const point = crossing(target);
      return {
        threshold_kwh: milestone.kwh,
        label: milestone.label,
        achieved_on: point ? point.date : null,
        estimated: true,
        basis: "estimated_pre_coverage_offset",
        achieved_before_coverage: false,
        offset_kwh: preCoverageKwh,
        progress_pct: progressPct,
        estimate: point
          ? {
              target_archive_kwh: target,
              cumulative_before_kwh: round2(point.before),
              day_kwh: round2(point.dayKwh),
              fraction_of_day: round3((target - point.before) / point.dayKwh),
            }
          : null,
      };
    }

    const point = crossing(milestone.kwh);
    return {
      threshold_kwh: milestone.kwh,
      label: milestone.label,
      achieved_on: point ? point.date : null,
      estimated: false,
      basis: "archive_cumulative",
      achieved_before_coverage: false,
      offset_kwh: 0,
      progress_pct: progressPct,
    };
  });

  return {
    method:
      "The 1 MWh date is estimated by subtracting pre-coverage lifetime output from 1,000 kWh and reading the archived cumulative crossing of that target. Later milestones use actual archived crossings with no offset.",
    coverage_start: coverageStart,
    archive_complete: Boolean(archiveComplete),
    pre_coverage_applied: preCoverageKwh > 0,
    lifetime_kwh: round2(lifetimeKwh),
    lifetime_source: lifetimeSource,
    archive_total_kwh: round2(archiveTotalKwh),
    pre_coverage_kwh: preCoverageKwh,
    items,
  };
}

function computeStreaks(days) {
  let longest = null;
  let current = null;
  let run = null;

  for (const day of days) {
    const producing = day.kwh !== null && day.kwh > 0;
    const contiguous = run !== null && nextDay(run.to) === day.date;

    if (producing && contiguous) {
      run.to = day.date;
      run.days += 1;
    } else if (producing) {
      run = { from: day.date, to: day.date, days: 1 };
    } else {
      run = null;
    }

    if (run && (!longest || run.days > longest.days)) longest = { ...run };
    current = run ? { ...run } : null;
  }

  return {
    longest,
    current,
  };
}

function computeRecordDays(days) {
  const records = [];
  let best = null;

  for (const day of days) {
    if (day.kwh === null) continue;
    if (best === null) {
      best = day.kwh; // baseline: the first archived day is not a "record".
      continue;
    }
    if (day.kwh > best) {
      records.push({ date: day.date, kwh: day.kwh, previous_best_kwh: best });
      best = day.kwh;
    }
  }

  return {
    count: records.length,
    latest: records.slice(-5).reverse(),
  };
}

/**
 * Full records/milestones payload, or null when the archive has no rows.
 * Canonical days drive every record; the logger's lifetime counter is used only
 * to quantify the pre-coverage gap for the first-milestone estimate and for
 * milestone progress. Nothing here writes to the archive.
 */
async function getRecords({ token, session } = {}) {
  const days = archiveService.getCanonicalDays();
  if (days.length === 0) return null;

  const firstDay = days[0].date;
  const lastDay = days[days.length - 1].date;
  const expectedDays = Math.round((dayKey(lastDay) - dayKey(firstDay)) / DAY_MS) + 1;
  const missingDays = Math.max(0, expectedDays - days.length);
  // The pre-coverage estimate needs a gapless archive: a hole would make part of
  // the logger/archive difference unrecorded archive energy, not pre-coverage
  // output, and subtracting it would invent a milestone date.
  const archiveComplete = missingDays === 0;
  const measured = days.filter((day) => day.kwh !== null);
  const archiveTotalKwh = round2(days.reduce((sum, day) => sum + (day.kwh ?? 0), 0));

  const lifetime = await benefitsService.getLifetimeGeneration({ token, session });
  const lifetimeKwh = lifetime?.kwh ?? archiveTotalKwh;
  const lifetimeSource = lifetime?.source ?? "archive";
  const preCoverageKwh =
    archiveComplete && lifetimeSource === "utl_logger" && lifetimeKwh > archiveTotalKwh
      ? round2(lifetimeKwh - archiveTotalKwh)
      : 0;

  const months = bucketMonths(days);
  const years = bucketYears(days);

  return {
    coverage: {
      first_day: firstDay,
      last_day: lastDay,
      archived_days: days.length,
      days_reported: measured.length,
      expected_days: expectedDays,
      missing_days: missingDays,
      inverter_off_days: days.filter((day) => day.isInverterOff).length,
    },
    lifetime: {
      generation_kwh: round2(lifetimeKwh),
      generation_source: lifetimeSource,
      observed_at: lifetime?.observed_at ?? null,
      archive_total_kwh: archiveTotalKwh,
      pre_coverage_kwh: preCoverageKwh,
      pre_coverage_applied: preCoverageKwh > 0,
    },
    highest_day: computeHighestDay(days),
    highest_month: computeHighestMonth(months),
    highest_power: computeHighestPower(),
    milestones: computeMilestones(days, {
      coverageStart: firstDay,
      lifetimeKwh,
      lifetimeSource,
      archiveTotalKwh,
      archiveComplete,
    }),
    streaks: computeStreaks(days),
    best_month: computeBestMonth(months),
    best_year: computeBestYear(years),
    record_days: computeRecordDays(days),
  };
}

module.exports = {
  getRecords,
  // Exported for deterministic checks/tests without touching the archive.
  computeMilestones,
  computeStreaks,
  computeRecordDays,
  MILESTONES,
};
