import { ApiError, apiBlob } from "@/api/client";
import { downloadBlob } from "@/utils/format";

/**
 * Single source of truth for the production-data export workflow used by BOTH
 * the Settings page and the Generation History page.
 *
 * The dialog owns the UX; this module owns the request contract. Dates travel as
 * plain "YYYY-MM-DD" / "YYYY-MM" strings and are never turned into Date objects
 * or `toISOString()` output on the way to the server, so a user who picks
 * "31 August 2026" always exports 2026-08-31 regardless of browser timezone.
 */

export type ExportScope = "date" | "range" | "month" | "year";
export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface ExportSelection {
  scope: ExportScope;
  /** YYYY-MM-DD, used when scope is "date". */
  date: string;
  /** YYYY-MM-DD, used when scope is "range". */
  from: string;
  /** YYYY-MM-DD, used when scope is "range". */
  to: string;
  /** YYYY-MM, used when scope is "month". */
  month: string;
  /** YYYY, used when scope is "year". */
  year: string;
}

export const EXPORT_SCOPES: { key: ExportScope; label: string; hint: string }[] = [
  { key: "date", label: "Particular date", hint: "One single day of production." },
  { key: "range", label: "Date range", hint: "An inclusive period, from and to." },
  { key: "month", label: "Month", hint: "One whole calendar month." },
  { key: "year", label: "Year", hint: "One whole calendar year." },
];

export const EXPORT_FORMATS: { key: ExportFormat; label: string; extension: string }[] = [
  { key: "csv", label: "CSV", extension: "csv" },
  { key: "xlsx", label: "Excel (.xlsx)", extension: "xlsx" },
  { key: "pdf", label: "PDF", extension: "pdf" },
];

/** Mirrors MAX_RANGE_DAYS in backend/services/exportScope.js so the user is told
 *  about an oversized range before a request is made. The server re-validates. */
const MAX_RANGE_DAYS = 400;

const MONTH_NAMES = [
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

function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysInYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

/** Inclusive day count between two calendar dates, UTC-safe for date-only keys. */
export function spanDays(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  );
}

/** UTC-midnight instant formatted while READING in UTC: cannot shift a day. */
function formatCalendarDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export interface ExportPeriodSummary {
  label: string;
  expectedDays: number;
}

/**
 * Resolve a selection to its human label and inclusive day count, or null when
 * the selection is not yet valid. The dialog uses this for the "N days selected"
 * confirmation shown before the format step.
 */
export function describeExportPeriod(selection: ExportSelection): ExportPeriodSummary | null {
  const { scope, date, from, to, month, year } = selection;

  if (scope === "date") {
    return isValidCalendarDate(date) ? { label: formatCalendarDate(date), expectedDays: 1 } : null;
  }

  if (scope === "range") {
    if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) return null;
    return {
      label: `${formatCalendarDate(from)} to ${formatCalendarDate(to)}`,
      expectedDays: spanDays(from, to),
    };
  }

  if (scope === "month") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    if (!match) return null;
    const [, y, m] = match;
    return {
      label: `${MONTH_NAMES[Number(m) - 1]} ${y}`,
      expectedDays: daysInMonth(Number(y), Number(m)),
    };
  }

  return /^\d{4}$/.test(year) ? { label: year, expectedDays: daysInYear(Number(year)) } : null;
}

/**
 * Client-side validation. Mirrors the server contract for fast feedback; the
 * server remains authoritative and re-validates every parameter.
 */
export function validateExportSelection(selection: ExportSelection): string | null {
  const { scope } = selection;

  if (scope === "date") {
    return isValidCalendarDate(selection.date) ? null : "Choose a valid date.";
  }

  if (scope === "range") {
    if (!isValidCalendarDate(selection.from)) return "Choose a valid start date.";
    if (!isValidCalendarDate(selection.to)) return "Choose a valid end date.";
    if (selection.from > selection.to) return "The start date must not be after the end date.";

    const span = spanDays(selection.from, selection.to);
    if (span > MAX_RANGE_DAYS) {
      return `The selected range spans ${span} days; the maximum is ${MAX_RANGE_DAYS} days.`;
    }

    return null;
  }

  if (scope === "month") {
    return /^(\d{4})-(0[1-9]|1[0-2])$/.test(selection.month) ? null : "Choose a month and a year.";
  }

  return /^\d{4}$/.test(selection.year) ? null : "Choose a valid year.";
}

/**
 * Query string for GET /api/export. Only the parameters relevant to the chosen
 * scope are sent, which is also what the server requires.
 */
export function buildExportQuery(selection: ExportSelection, format: ExportFormat): string {
  const params = new URLSearchParams({ format, scope: selection.scope });

  if (selection.scope === "date") {
    params.set("date", selection.date);
  } else if (selection.scope === "range") {
    params.set("from", selection.from);
    params.set("to", selection.to);
  } else if (selection.scope === "month") {
    params.set("month", selection.month);
  } else {
    params.set("year", selection.year);
  }

  return params.toString();
}

/** Deterministic fallback name, used only if the server sends no Content-Disposition. */
function fallbackFilename(selection: ExportSelection, format: ExportFormat): string {
  const slug =
    describeExportPeriod(selection)
      ?.label.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ?? "period";
  return `utl-production-${slug || "period"}.${format}`;
}

/** User-facing message for a failed export. Raw backend JSON is never shown. */
export function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (/authentication|token missing|unauthor/i.test(error.code)) {
      return "Your session has expired. Sign in again, then retry the export.";
    }

    if (
      /start date|end date|YYYY|scope|format|maximum|does not accept|Unsupported/i.test(error.code)
    ) {
      return error.code;
    }

    return "The export could not be generated. Please try again.";
  }

  return "The export could not be generated. Check your connection and try again.";
}

/**
 * Request the export through the app's authenticated API client and hand the
 * resulting file to the browser. Throws on failure so the caller can keep the
 * dialog open and explain what went wrong.
 */
export async function downloadProductionExport(
  selection: ExportSelection,
  format: ExportFormat,
): Promise<void> {
  const { blob, filename } = await apiBlob(`/export?${buildExportQuery(selection, format)}`);

  downloadBlob(filename || fallbackFilename(selection, format), blob);
}
