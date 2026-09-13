/**
 * Deterministic, archive-backed historical query resolver for the AI assistant.
 *
 * Given a chat message, resolves the calendar period the user is asking about
 * (previous/last month, a named month, a trailing window, an explicit date
 * range, or a two-period comparison) and renders a COMPACT, authoritative
 * EnergyScope-computed summary from the local archive.
 *
 * Design rules:
 *  - RESOLVER IS DETERMINISTIC: no LLM, no ML, no randomness.
 *  - CONSERVATIVE: ambiguous phrasing returns null (the chat falls back to the
 *    static context) rather than guessing a period.
 *  - AUTHORITATIVE: aggregates come from archiveService.getRangeSummary()
 *    which uses canonicalGeneration() only - never the raw generation_kwh
 *    column that carries legacy integrated values.
 *  - NO RAW ROWS ARE SERIALIZED: only scalars (total, daily average, best/worst
 *    day, days-reported) are rendered; the archive itself is never included.
 *  - HONEST COVERAGE: daysReported is always exposed and an explicit note is
 *    added when the calendar range contains days the archive does not cover.
 *    Missing days are never zero-filled.
 */

const archiveService = require("./archiveService");

/** Consistent with routes/archive.js MAX_RANGE_DAYS (400). */
const MAX_RANGE_DAYS = 400;

const MONTH_NUMBERS = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH_NAME_ALT = Object.keys(MONTH_NUMBERS).join("|");
const MONTH_LABELS = [
  "",
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

const COMPARE_MARKER =
  /\b(?:compare|compares|comparing|compared\s+to|versus|vs\.?|vs\b|however\s+vs)\b/i;

const RELATIVE_MONTH_CONTEXT = new Set([
  "in",
  "of",
  "during",
  "throughout",
  "from",
  "since",
  "between",
  "starting",
  "beginning",
]);

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthPeriod(year, month) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  return { kind: "month", label: `${MONTH_LABELS[month]} ${year}`, from, to };
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function spanDays(from, to) {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  );
}

/**
 * Resolve a single period expression (used both standalone and per-side of a
 * comparison). Returns one candidate or null; never throws.
 * @param {string} text
 * @param {string} asOf 'YYYY-MM-DD' IST anchor date
 */
function resolveSinglePeriod(text, asOf) {
  const asOfYear = Number(asOf.slice(0, 4));
  const asOfMonth = Number(asOf.slice(5, 7));
  const candidates = [];

  // -- previous / last month ------------------------------------------------
  if (/\b(?:previous|last)\s+month\b/i.test(text)) {
    const year = asOfMonth === 1 ? asOfYear - 1 : asOfYear;
    const month = asOfMonth === 1 ? 12 : asOfMonth - 1;
    candidates.push(monthPeriod(year, month));
  }

  // -- explicit ISO date range ----------------------------------------------
  const rangeMatch =
    /\b(?:from\s+)?(\d{4}-\d{2}-\d{2})\s+(?:to|until|through)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(
      text,
    ) || /\bbetween\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
  if (rangeMatch) {
    const from = rangeMatch[1];
    const to = rangeMatch[2];
    if (
      ISO_DATE.test(from) &&
      ISO_DATE.test(to) &&
      from <= to &&
      spanDays(from, to) <= MAX_RANGE_DAYS
    ) {
      candidates.push({ kind: "range", label: `${from} to ${to}`, from, to });
    }
  }

  // -- ISO month "2026-08" --------------------------------------------------
  const isoMonthMatch = /\b(\d{4})-(0[1-9]|1[0-2])(?!-\d{1,2})\b/.exec(text);
  if (isoMonthMatch) {
    candidates.push(monthPeriod(Number(isoMonthMatch[1]), Number(isoMonthMatch[2])));
  }

  // -- trailing windows: last N days / last week ----------------------------
  const daysMatch = /\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/i.exec(text);
  const weekMatch = /\b(?:last|past|previous)\s+week\b/i.exec(text);
  const trailingDays = daysMatch ? Number(daysMatch[1]) : weekMatch ? 7 : 0;
  if (trailingDays >= 1 && trailingDays <= MAX_RANGE_DAYS) {
    const from = addDays(asOf, -trailingDays);
    const to = addDays(asOf, -1);
    candidates.push({
      kind: "days",
      label: weekMatch ? "last week" : `last ${trailingDays} days`,
      from,
      to,
    });
  }

  // -- named month, optionally with an explicit year ------------------------
  const nameRe = new RegExp(`\\b(${MONTH_NAME_ALT})\\b`, "gi");
  let namedMatch;
  while ((namedMatch = nameRe.exec(text)) !== null) {
    const name = namedMatch[1].toLowerCase();
    const month = MONTH_NUMBERS[name];
    if (!month) continue;

    const after = text.slice(namedMatch.index + namedMatch[0].length);
    const yearMatch = after.match(/^\s*(?:,\s*)?(?:of\s*)?(\d{4})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    // 'may' is a modal verb far more often than a month name. Treat it as a
    // month only with an explicit year or a clear context word before it.
    const prevWord = (text.slice(0, namedMatch.index).match(/(\w+)\s*$/)?.[1] || "").toLowerCase();
    if (month === 5 && !year && !RELATIVE_MONTH_CONTEXT.has(prevWord)) continue;

    // A month later in the same year with no year stated is ambiguous
    // (currently, last year, or next year) - stay conservative.
    if (!year && month > asOfMonth) continue;

    candidates.push(monthPeriod(year ?? asOfYear, month));
  }

  // Multiple distinguishable periods in one expression (e.g. "August and
  // September") without a comparison marker are ambiguous for a single-period
  // answer; the comparison branch handles the two-period case.
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = `${c.from}|${c.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Resolve a message into a historical period query (single or comparison),
 * or null when the message is not a reliably interpretable period question.
 * @param {string} message
 * @param {{asOf?: string}} [opts] asOf = 'YYYY-MM-DD' IST anchor (default today)
 */
function resolveHistoricalPeriod(message, { asOf } = {}) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return null;
  // Accept 'YYYY-MM-DD' strings directly; otherwise defer to istDateString so a
  // Date instant (or any convertible value) still resolves deterministically.
  const anchor =
    typeof asOf === "string" && ISO_DATE.test(asOf)
      ? asOf
      : asOf == null
        ? archiveService.istDateString(new Date())
        : archiveService.istDateString(asOf);
  if (!ISO_DATE.test(anchor)) return null;

  // -- comparison: split out the marker, then on and/commas, resolve each side --
  if (COMPARE_MARKER.test(text)) {
    // Split on the marker itself so "August versus September" yields two
    // distinct sides even though the names are only joined by the compare word.
    const parts = text.split(COMPARE_MARKER).flatMap((segment) =>
      segment
        .split(/\band\b|,|;\s*/i)
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const seen = new Set();
    const periods = [];
    for (const part of parts) {
      const resolved = resolveSinglePeriod(part, anchor);
      if (!resolved) continue;
      const key = `${resolved.from}|${resolved.to}`;
      if (!seen.has(key)) {
        seen.add(key);
        periods.push(resolved);
      }
      if (periods.length >= 2) break;
    }
    if (periods.length === 2) {
      return {
        kind: "comparison",
        label: `${periods[0].label} vs ${periods[1].label}`,
        periods,
      };
    }
    // Marker present but not resolvable into two periods: fall through to the
    // single-period path so a lone resolvable side still gets data.
  }

  return resolveSinglePeriod(text, anchor);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HEADER =
  "REQUESTED HISTORY (CALCULATED BY ENERGYSCOPE - AUTHORITATIVE. Do not recalculate or estimate.)";

/**
 * @param {{kind: string, label: string, from: string, to: string}} period
 */
function periodLines(period) {
  const summary = archiveService.getRangeSummary({ from: period.from, to: period.to });
  const lines = [`period: ${period.label}`, `range: ${period.from} to ${period.to}`];
  if (!summary) {
    lines.push("archived days reported: 0", "archived data for this period: not available");
    return lines;
  }
  lines.push(`archived days reported: ${summary.daysReported}`);
  const calendarDays = spanDays(period.from, period.to);
  if (summary.daysReported < calendarDays) {
    lines.push(
      `note: the range covers ${calendarDays} calendar days but the archive reports only ${summary.daysReported} days`,
    );
  }
  lines.push(`period total kWh: ${summary.totalKwh}`);
  lines.push(`daily average kWh/day: ${summary.dailyAverageKwh}`);
  lines.push(`best day: ${summary.bestDay.kwh} kWh on ${summary.bestDay.date}`);
  lines.push(`worst day: ${summary.worstDay.kwh} kWh on ${summary.worstDay.date}`);
  return lines;
}

/**
 * Render the compact authoritative appendix block for a resolved period query.
 * Returns null when the message does not resolve to a period.
 */
function buildHistoricalAppendix(message, { asOf } = {}) {
  const resolved = resolveHistoricalPeriod(message, { asOf });
  if (!resolved) return null;

  if (resolved.kind === "comparison") {
    const lines = [
      "REQUESTED HISTORY COMPARISON (CALCULATED BY ENERGYSCOPE - AUTHORITATIVE. Do not recalculate or estimate.)",
      "Each period below has its own authoritative EnergyScope summary. You may describe the difference between them, but never recompute either period.",
    ];
    resolved.periods.forEach((period, index) => {
      lines.push("", `PERIOD ${index + 1}`, ...periodLines(period));
    });
    return lines.join("\n");
  }

  return [HEADER, ...periodLines(resolved)].join("\n");
}

module.exports = {
  MAX_RANGE_DAYS,
  resolveHistoricalPeriod,
  buildHistoricalAppendix,
  _internals: { resolveSinglePeriod, periodLines, addDays, spanDays, monthPeriod },
};
