/**
 * Pure, side-effect-free scope handling for the production-history export.
 *
 * Deliberately free of Express, UTL and database access so the whole parameter
 * contract (formats, scopes, boundaries) can be exercised deterministically by
 * scripts/check-export-scope.js without a network or a running server.
 *
 * All dates here are CALENDAR dates in the plant's Asia/Kolkata operating
 * timezone, carried as plain "YYYY-MM-DD" strings. They are never round-tripped
 * through `new Date(string)` local time or `toISOString()`, because both can move
 * a selected day into the previous/next calendar day. Instant -> calendar date
 * conversion happens only in generatedOnLabel(), which pins the timezone.
 */

const plantConfig = require("../config/plant.json");

/** Matches routes/charts.js MAX_RANGE_DAYS so one request never asks UTL for more
 *  than the rest of the app is willing to. */
const MAX_RANGE_DAYS = 400;

const SCOPES = new Set(["date", "range", "month", "year"]);

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_MONTH_NUMBER = /^(0?[1-9]|1[0-2])$/;
const ISO_YEAR = /^\d{4}$/;

/** A rejected parameter. Always surfaces as HTTP 400 - never as a 500. */
class ExportScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExportScopeError";
    this.statusCode = 400;
  }
}

function isValidCalendarDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertCalendarDate(value, field) {
  if (!isValidCalendarDate(value)) {
    throw new ExportScopeError(`${field} must be a valid calendar date in YYYY-MM-DD form.`);
  }
  return value;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive day count between two calendar dates. */
function spanDays(from, to) {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  );
}

/** Every calendar date in an inclusive range, ascending. */
function eachCalendarDate(from, to) {
  const out = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const total = spanDays(from, to);
  for (let i = 0; i < total; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * "2026-08-31" -> "31 August 2026".
 *
 * Formats a UTC-midnight instant while READING IN UTC, so the rendered day can
 * never drift into an adjacent calendar day regardless of the server's timezone.
 */
function formatCalendarDate(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function monthLabel(month) {
  return MONTH_LABELS[month - 1];
}

/** Every "YYYY-MM" key touched by an inclusive date range, ascending. */
function monthKeysBetween(from, to) {
  const keys = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));

  for (;;) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year === endYear && month === endMonth) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return keys;
}

function normalizeChartDate(value, year, month) {
  const raw = String(value ?? "");
  if (ISO_DATE.test(raw)) return raw;

  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Reject parameters that belong to a different scope instead of silently
 * ignoring them: a caller that sends both `date` and `month` has made a mistake,
 * and guessing which one they meant would silently export the wrong period.
 * (`month` legitimately accepts `year` so "08" + "2026" works.)
 */
function rejectForeignParams(scope, params) {
  const foreign = {
    date: ["from", "to", "month", "year"],
    range: ["date", "month", "year"],
    month: ["date", "from", "to"],
    year: ["date", "from", "to", "month"],
  }[scope];

  for (const name of foreign) {
    const value = params[name];
    if (value !== undefined && String(value).trim() !== "") {
      throw new ExportScopeError(
        `scope "${scope}" does not accept the "${name}" parameter; it was sent as "${value}".`,
      );
    }
  }
}

/**
 * Validate the requested export scope and resolve it to an inclusive date range.
 *
 * @param {{scope?: string, date?: string, from?: string, to?: string,
 *          month?: string, year?: string}} params raw, untrusted query values
 * @returns {{scope: string, from: string, to: string, expectedDays: number,
 *            label: string, monthKeys: string[]}}
 * @throws {ExportScopeError} on any malformed, unknown or conflicting parameter
 */
function resolveExportScope(params = {}) {
  const scope = String(params.scope ?? "")
    .trim()
    .toLowerCase();

  if (!SCOPES.has(scope)) {
    throw new ExportScopeError(
      `Unsupported export scope "${params.scope ?? ""}". Use one of: date, range, month, year.`,
    );
  }

  rejectForeignParams(scope, params);

  let from;
  let to;
  let label;

  if (scope === "date") {
    from = assertCalendarDate(params.date, "date");
    to = from;
    label = formatCalendarDate(from);
  } else if (scope === "range") {
    const start = assertCalendarDate(params.from, "from");
    const end = assertCalendarDate(params.to, "to");

    if (start > end) {
      throw new ExportScopeError(
        `The start date (${start}) must not be after the end date (${end}).`,
      );
    }

    const span = spanDays(start, end);
    if (span > MAX_RANGE_DAYS) {
      throw new ExportScopeError(
        `The selected range spans ${span} days; the maximum exportable range is ${MAX_RANGE_DAYS} days.`,
      );
    }

    from = start;
    to = end;
    label = `${formatCalendarDate(start)} to ${formatCalendarDate(end)}`;
  } else if (scope === "month") {
    const rawMonth = String(params.month ?? "").trim();
    const rawYear = String(params.year ?? "").trim();

    let year;
    let month;

    const iso = ISO_MONTH.exec(rawMonth);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
    } else if (ISO_MONTH_NUMBER.test(rawMonth) && ISO_YEAR.test(rawYear)) {
      year = Number(rawYear);
      month = Number(rawMonth);
    } else {
      throw new ExportScopeError(
        "month must use the YYYY-MM form (for example 2026-08), or be a month number together with a YYYY year.",
      );
    }

    from = `${year}-${String(month).padStart(2, "0")}-01`;
    to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
    label = `${monthLabel(month)} ${year}`;
  } else {
    const rawYear = String(params.year ?? "").trim();
    if (!ISO_YEAR.test(rawYear)) {
      throw new ExportScopeError("year must use the YYYY form, for example 2026.");
    }

    from = `${rawYear}-01-01`;
    to = `${rawYear}-12-31`;
    label = rawYear;
  }

  return {
    scope,
    from,
    to,
    expectedDays: spanDays(from, to),
    label,
    monthKeys: monthKeysBetween(from, to),
  };
}

/**
 * Totals over the resolved rows. Recorded days and days-without-record are kept
 * apart so an export can state "no record" instead of implying a zero kWh day.
 */
function summarizeProductionHistory(rows = []) {
  let totalKwh = 0;
  let recordedDays = 0;

  for (const row of rows) {
    if (row.recorded) {
      totalKwh += row.kwh;
      recordedDays += 1;
    }
  }

  return {
    totalKwh: Number(totalKwh.toFixed(2)),
    recordedDays,
    daysWithoutRecord: rows.length - recordedDays,
    expectedDays: rows.length,
  };
}

const IST_STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * "04/10/2026 14:05 IST" for an instant, pinned to the plant's operating
 * timezone - the same Asia/Kolkata convention the rest of the app reports in.
 */
function generatedOnLabel(instant = new Date()) {
  const parts = {};
  for (const part of IST_STAMP.formatToParts(instant)) parts[part.type] = part.value;
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} IST`;
}

/** Plant identity for the report header, taken from config rather than invented. */
function plantMeta() {
  return {
    name: plantConfig.name || "Solar Plant",
    location: plantConfig.location || null,
    timezone: plantConfig.timezone || "Asia/Kolkata",
  };
}

/** Filesystem-safe slug for the download name, e.g. "august-2026". */
function periodSlug(label) {
  return (
    String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "period"
  );
}

module.exports = {
  MAX_RANGE_DAYS,
  ExportScopeError,
  resolveExportScope,
  summarizeProductionHistory,
  generatedOnLabel,
  plantMeta,
  periodSlug,
  // exported for the deterministic checker
  isValidCalendarDate,
  eachCalendarDate,
  monthKeysBetween,
  normalizeChartDate,
  formatCalendarDate,
  daysInMonth,
  spanDays,
};
