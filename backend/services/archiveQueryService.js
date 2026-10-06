/**
 * Deterministic, archive-backed historical query resolver for the AI assistant.
 *
 * Given a chat message, resolves the calendar period the user is asking about
 * (previous/last month, this/current month, a named month, a trailing window,
 * an explicit date range, a SINGLE DATE, a partial / day-of-month range, or a
 * two-period / same-date-range comparison) and renders a COMPACT, authoritative
 * EnergyScope-computed summary from the local archive.
 *
 * Design rules:
 *  - RESOLVER IS DETERMINISTIC: no LLM, no ML, no randomness.
 *  - CONSERVATIVE: ambiguous phrasing returns null (the chat falls back to the
 *    static context) rather than guessing a period.
 *  - AUTHORITATIVE: aggregates come from archiveService.getRangeSummary() and
 *    exact per-date values come from archiveService.getDailyRows(); both use
 *    canonicalGeneration() only - never the raw generation_kwh column that
 *    carries legacy integrated values. No generation value is ever recomputed
 *    here or by the model.
 *  - EXACT DAILY ROWS: a single-date query emits that date's canonical kWh plus
 *    its provenance (source, manual-override flag); a bounded range emits one
 *    line per requested date. Only the dates the question covers are sent - the
 *    whole archive is never included - and long windows degrade to aggregate +
 *    missing dates with an explicit note.
 *  - HONEST COVERAGE: every requested date is accounted for. A date reported as
 *    absent is one an archive query proved has no row; a date that merely was
 *    not listed is never described as missing. Missing days are never zero-filled
 *    and never estimated.
 *  - SAME DATE RANGE: when the user says "same date range", the resolver keeps
 *    the SAME day-of-month window and shifts it back month by month. It never
 *    silently substitutes a full month for an explicit partial range.
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
  /\b(?:compare|compares|comparing|compared\s+to|compared\s+with|versus|vs\.?|vs\b|however\s+vs)\b|\bor\b/i;

/** Secondary split INSIDE one already-marker-delimited comparison side. */
const SEGMENT_SPLIT = /\band\b|,|;|:\s*|\bwith\b/i;

/** "same date range" / "same period" driver for month-to-month shifting. */
const SAME_RANGE_RE = /\bsame\s+(?:date\s+)?(?:range|period)\b/i;

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

/** Back/forwards month key 'YYYY-MM' by an integer delta. */
function shiftMonthKey(key, delta) {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7));
  m += delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Day-of-month window within one month, clamped to the month's length. */
function monthWindow(monthKey, dayFrom, dayTo) {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const max = daysInMonth(y, m);
  const f = Math.max(1, Math.min(dayFrom, max));
  const t = Math.max(f, Math.min(dayTo, max));
  const from = `${monthKey}-${String(f).padStart(2, "0")}`;
  const to = `${monthKey}-${String(t).padStart(2, "0")}`;
  return {
    kind: "range",
    label: f === t ? `${MONTH_LABELS[m]} ${f}, ${y}` : `${MONTH_LABELS[m]} ${f}-${t}, ${y}`,
    from,
    to,
    monthKey,
    dayFrom: f,
    dayTo: t,
  };
}

/** Current calendar month's completed coverage window: 1st .. yesterday. */
function currentMonthWindow(asOf) {
  const day = Number(asOf.slice(8, 10));
  if (!(day >= 2)) return null; // no completed days in this month yet
  const win = monthWindow(asOf.slice(0, 7), 1, day - 1);
  win.label = `current month to date (${win.label})`;
  return win;
}

/**
 * Year inference for a bare month/day reference. Mirrors the named-month rule:
 * a month later in the same year with no stated year is ambiguous -> null.
 */
function inferYearForMonthName(monthName, explicitYear, asOfYear, asOfMonth) {
  if (explicitYear) return Number(explicitYear);
  const month = MONTH_NUMBERS[String(monthName).toLowerCase()];
  if (!month || month > asOfMonth) return null;
  return asOfYear;
}

function dayLabel(year, month, day) {
  return `${MONTH_LABELS[month]} ${day}, ${year}`;
}

// ---------------------------------------------------------------------------
// Single-period resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single period expression (used both standalone and per-side of a
 * comparison). Returns one candidate or null; never throws.
 *
 * Supported shapes (all case-insensitive):
 *   - "previous month" / "previous months" / "last month"      -> full month
 *   - "this month" / "current month"                            -> full month
 *   - "2026-08-01 to 2026-08-20" / between .. and ..
 *   - "2026-08-22"                                              -> single day
 *   - "2026-08"                                                 -> ISO month
 *   - "August 1 to August 20" / "from Aug 1 to Aug 20"
 *   - "1 August 2026 to 15 August 2026" / "10 Sep to 20 Sep"
 *   - "Aug 10 through August 20"
 *   - "August 1-20" / "Aug 1-20" / "1-20 August"
 *   - "first 10 days of August"
 *   - "August 22" / "22 August" / "August 22, 2026" / "15 August 2026"
 *   - "last N days" / "last week"
 *   - a bare named month: "August", "September 2026"
 * @param {string} text
 * @param {string} asOf 'YYYY-MM-DD' IST anchor date
 */
function resolveSinglePeriod(text, asOf) {
  const asOfYear = Number(asOf.slice(0, 4));
  const asOfMonth = Number(asOf.slice(5, 7));
  const candidates = [];
  // Month-name spans already claimed by a more specific day/range match, so the
  // fallback bare-named-month pass cannot also fire for the same text.
  const consumed = [];

  const insideConsumed = (index) =>
    consumed.some((span) => index >= span.start && index <= span.end);
  const claim = (m) => consumed.push({ start: m.index, end: m.index + m[0].length });

  // -- previous / last month (singular or plural) ---------------------------
  if (/\b(?:previous|last)\s+months?\b/i.test(text)) {
    const year = asOfMonth === 1 ? asOfYear - 1 : asOfYear;
    const month = asOfMonth === 1 ? 12 : asOfMonth - 1;
    candidates.push(monthPeriod(year, month));
  }

  // -- this / current month ---------------------------------------------------
  if (/\b(?:this|current)\s+months?\b/i.test(text)) {
    candidates.push({
      ...monthPeriod(asOfYear, asOfMonth),
      label: `current month (${MONTH_LABELS[asOfMonth]} ${asOfYear})`,
    });
  }

  // -- explicit ISO date range ------------------------------------------------
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
      claim(rangeMatch);
    }
  }

  // -- two-endpoint named range (may cross months) ----------------------------
  // "from August 1 to August 20", "Sep 10 through August 20", "1 .. 20"
  const twoEndpoints = new RegExp(
    `\\b(?:from\\s+|between\\s+)?(${MONTH_NAME_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?` +
      `(?:\\s*,?\\s*(\\d{4}))?\\s+(?:to|through|till|until|and)\\s+` +
      `(${MONTH_NAME_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`,
    "i",
  );
  {
    const m = twoEndpoints.exec(text);
    if (m) {
      const year1 = inferYearForMonthName(m[1], m[3], asOfYear, asOfMonth);
      const year2 = inferYearForMonthName(m[4], m[6], asOfYear, asOfMonth);
      if (year1 !== null && year2 !== null) {
        const from = `${year1}-${String(MONTH_NUMBERS[m[1].toLowerCase()]).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
        const to = `${year2}-${String(MONTH_NUMBERS[m[4].toLowerCase()]).padStart(2, "0")}-${String(Number(m[5])).padStart(2, "0")}`;
        if (from <= to && spanDays(from, to) <= MAX_RANGE_DAYS) {
          candidates.push({
            kind: "range",
            label: `${MONTH_LABELS[MONTH_NUMBERS[m[1].toLowerCase()]]} ${Number(m[2])}, ${year1} to ${MONTH_LABELS[MONTH_NUMBERS[m[4].toLowerCase()]]} ${Number(m[5])}, ${year2}`,
            from,
            to,
          });
          claim(m);
        }
      }
    }
  }

  // -- two-endpoint named range, day-first (may cross months) ------------------
  // "1 August 2026 to 15 August 2026", "from 10 Sep to 20 Sep", "3rd of May to 9 May".
  // Without this the bare-named-month fallback sees two different months and the
  // whole expression is treated as ambiguous, so the user gets no archive context
  // at all for a phrasing this ordinary.
  const twoEndpointsDayFirst = new RegExp(
    `\\b(?:from\\s+|between\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALT})\\b` +
      `(?:\\s*,?\\s*(\\d{4}))?\\s+(?:to|through|till|until|and)\\s+` +
      `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALT})\\b(?:\\s*,?\\s*(\\d{4}))?`,
    "i",
  );
  {
    const m = twoEndpointsDayFirst.exec(text);
    if (m) {
      const month1 = MONTH_NUMBERS[m[2].toLowerCase()];
      const month2 = MONTH_NUMBERS[m[5].toLowerCase()];
      const year1 = inferYearForMonthName(m[2], m[3], asOfYear, asOfMonth);
      const year2 = inferYearForMonthName(m[5], m[6], asOfYear, asOfMonth);
      const day1 = Number(m[1]);
      const day2 = Number(m[4]);
      if (
        year1 !== null &&
        year2 !== null &&
        day1 <= daysInMonth(year1, month1) &&
        day2 <= daysInMonth(year2, month2)
      ) {
        const from = `${year1}-${String(month1).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
        const to = `${year2}-${String(month2).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
        if (from <= to && spanDays(from, to) <= MAX_RANGE_DAYS) {
          candidates.push({
            kind: "range",
            label: `${MONTH_LABELS[month1]} ${day1}, ${year1} to ${MONTH_LABELS[month2]} ${day2}, ${year2}`,
            from,
            to,
          });
          claim(m);
        }
      }
    }
  }

  // -- single-month day range: "August 1-20", "Aug 10 through 20" -------------
  const singleMonthRange = new RegExp(
    `\\b(${MONTH_NAME_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|to|through|till|until)` +
      `\\s*(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)` +
      `(?:\\s*,?\\s*(\\d{4}))?\\b`,
    "i",
  );
  {
    const m = singleMonthRange.exec(text);
    if (m) {
      const year = inferYearForMonthName(m[1], m[4], asOfYear, asOfMonth);
      const month = MONTH_NUMBERS[m[1].toLowerCase()];
      const day1 = Number(m[2]);
      const day2 = Number(m[3]);
      if (year !== null && day1 <= day2 && day2 <= daysInMonth(year, month)) {
        const from = `${year}-${String(month).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
        const to = `${year}-${String(month).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
        candidates.push({
          kind: "range",
          label: `${MONTH_LABELS[month]} ${day1}-${day2}, ${year}`,
          from,
          to,
        });
        claim(m);
      }
    }
  }

  // -- day-first range: "1-20 August" -----------------------------------------
  const dayFirstRange = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|to|through|till|until)\\s*` +
      `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALT})\\b` +
      `(?:\\s*,?\\s*(\\d{4}))?`,
    "i",
  );
  {
    const m = dayFirstRange.exec(text);
    if (m) {
      const year = inferYearForMonthName(m[3], m[4], asOfYear, asOfMonth);
      const month = MONTH_NUMBERS[m[3].toLowerCase()];
      const day1 = Number(m[1]);
      const day2 = Number(m[2]);
      if (year !== null && day1 <= day2 && day2 <= daysInMonth(year, month)) {
        const from = `${year}-${String(month).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
        const to = `${year}-${String(month).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
        candidates.push({
          kind: "range",
          label: `${MONTH_LABELS[month]} ${day1}-${day2}, ${year}`,
          from,
          to,
        });
        claim(m);
      }
    }
  }

  // -- "first 10 days of August" ----------------------------------------------
  const firstDays = new RegExp(
    `\\bfirst\\s+(\\d{1,2})\\s+days?\\s+of\\s+(${MONTH_NAME_ALT})\\b`,
    "i",
  );
  {
    const m = firstDays.exec(text);
    if (m) {
      const year = inferYearForMonthName(m[2], null, asOfYear, asOfMonth);
      const month = MONTH_NUMBERS[m[2].toLowerCase()];
      const n = Number(m[1]);
      if (year !== null && n >= 1 && n <= daysInMonth(year, month)) {
        candidates.push({
          kind: "range",
          label: `first ${n} days of ${MONTH_LABELS[month]}, ${year}`,
          from: `${year}-${String(month).padStart(2, "0")}-01`,
          to: `${year}-${String(month).padStart(2, "0")}-${String(n).padStart(2, "0")}`,
        });
        claim(m);
      }
    }
  }

  // -- single day, month-first: "August 22", "August 22, 2026" ---------------
  const monthFirstDay = new RegExp(
    `\\b(${MONTH_NAME_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:\\s*,?\\s*(\\d{4}))?\\b`,
    "i",
  );
  {
    const m = monthFirstDay.exec(text);
    if (m && !insideConsumed(m.index)) {
      const year = inferYearForMonthName(m[1], m[3], asOfYear, asOfMonth);
      const month = MONTH_NUMBERS[m[1].toLowerCase()];
      const day = Number(m[2]);
      if (year !== null && day >= 1 && day <= daysInMonth(year, month)) {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          kind: "day",
          label: dayLabel(year, month, day),
          date,
          from: date,
          to: date,
        });
        claim(m);
      }
    }
  }

  // -- single day, day-first: "22 August", "15 August 2026" ------------------
  const dayFirstSingle = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALT})\\b(?:\\s*,?\\s*(\\d{4}))?`,
    "i",
  );
  {
    const m = dayFirstSingle.exec(text);
    if (m && !insideConsumed(m.index)) {
      const year = inferYearForMonthName(m[2], m[3], asOfYear, asOfMonth);
      const month = MONTH_NUMBERS[m[2].toLowerCase()];
      const day = Number(m[1]);
      if (year !== null && day >= 1 && day <= daysInMonth(year, month)) {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          kind: "day",
          label: dayLabel(year, month, day),
          date,
          from: date,
          to: date,
        });
        claim(m);
      }
    }
  }

  // -- single ISO date: "2026-08-22", "on 2026-08-22" ------------------------
  {
    const m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    if (m && !rangeMatch && !insideConsumed(m.index)) {
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      const roundTrip = new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10);
      if (roundTrip === date && spanDays(date, date) === 1) {
        candidates.push({
          kind: "day",
          label: dayLabel(Number(m[1]), Number(m[2]), Number(m[3])),
          date,
          from: date,
          to: date,
        });
        claim(m);
      }
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
    if (insideConsumed(namedMatch.index)) continue;

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

// ---------------------------------------------------------------------------
// Same-date-range comparisons
// ---------------------------------------------------------------------------

/**
 * Shift a base day-window back month by month. offset 1 = previous month,
 * offset 2 = two months back, etc. Earlier months are only added while the
 * preceding shifted window actually has archived days, so we never dump rows of
 * empty months.
 */
function expandSameRangeWindows(
  baseWin /** monthWindow result */,
  asOf,
  { expandMore = true } = {},
) {
  const periods = [baseWin];
  const limit = 6;
  let lastRecorded = null;
  for (let off = 1; off <= limit; off++) {
    const prevKey = shiftMonthKey(baseWin.monthKey, -off);
    const win = monthWindow(prevKey, baseWin.dayFrom, baseWin.dayTo);
    if (off === 1) {
      win.label = `${win.label} (previous month, same date range)`;
    } else {
      win.label = `${win.label} (${off} months back, same date range)`;
    }
    const rec = archiveService.getRangeSummary({ from: win.from, to: win.to });
    if (off === 1) {
      periods.push(win);
      lastRecorded = rec ? rec.daysReported : 0;
      continue;
    }
    if (!expandMore || lastRecorded <= 0) break;
    periods.push(win);
    lastRecorded = rec ? rec.daysReported : 0;
  }
  return periods;
}

/**
 * Build a same-date-range comparison: current/anchor coverage window in the
 * lead, followed by each previous month with the identical day-of-month window.
 * If a resolved range is available (e.g. "August 1-15 ... same date range"),
 * it becomes the anchor window instead.
 */
function buildSameRangeComparison(text, asOf, { periods: resolvedPeriods } = {}) {
  let baseWin = null;
  const lead = resolvedPeriods?.[0];
  if (lead?.kind === "range" && lead.from && lead.to && lead.from !== lead.to) {
    baseWin = monthWindow(
      lead.from.slice(0, 7),
      Number(lead.from.slice(8, 10)),
      Number(lead.to.slice(8, 10)),
    );
  }
  if (!baseWin && lead?.kind === "day") {
    baseWin = monthWindow(
      lead.from.slice(0, 7),
      Number(lead.from.slice(8, 10)),
      Number(lead.from.slice(8, 10)),
    );
  }
  if (!baseWin) baseWin = currentMonthWindow(asOf);
  if (!baseWin) return null;

  const expandMore =
    !lead || /previous\s+months|\blast\s+months\b|\bmonths?\s+(?:back|ago)\b/i.test(text);
  const periods = expandSameRangeWindows(baseWin, asOf, { expandMore });

  return {
    kind: "comparison",
    sameDateRange: true,
    label: `${periods[0].label} vs previous months (same date range)`,
    periods,
  };
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

  const sameRange = SAME_RANGE_RE.test(text);
  const hasThisMonth = /\b(?:this|current)\s+months?\b/i.test(text);
  const hasPrevMonth = /\b(?:previous|last)\s+months?\b/i.test(text);

  // -- comparison: split out the marker, then on and/commas/with, resolve each side --
  if (COMPARE_MARKER.test(text)) {
    const parts = text.split(COMPARE_MARKER).flatMap((segment) =>
      segment
        .split(SEGMENT_SPLIT)
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

    if (periods.length >= 2) {
      if (sameRange) {
        const cmp = buildSameRangeComparison(text, anchor, { periods });
        if (cmp) return cmp;
      }
      return {
        kind: "comparison",
        label: `${periods[0].label} vs ${periods[1].label}`,
        periods: [periods[0], periods[1]],
      };
    }
    // Marker present but not resolvable into two periods: fall through so a
    // lone resolvable side (and the same-date-range driver) still gets data.
  }

  // -- "same date range" without a comparison marker --------------------------
  // e.g. "this months avg vs previous months avg same date range" or
  // "compare to previous month in the same date range".
  if (sameRange && (hasThisMonth || hasPrevMonth)) {
    const cmp = buildSameRangeComparison(text, anchor, {});
    if (cmp) return cmp;
  }

  return resolveSinglePeriod(text, anchor);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HEADER =
  "REQUESTED HISTORY (CALCULATED BY ENERGYSCOPE - AUTHORITATIVE. Do not recalculate or estimate.)";

// Per-date rows are the point of this appendix, but they must stay compact. Two
// months of daily lines is the ceiling; a longer explicit window falls back to
// aggregate + missing dates and says so rather than flooding the prompt.
const MAX_DAILY_LISTING_DAYS = 62;
const MAX_MISSING_LISTED = 60;

/** Every calendar date in an inclusive range, ascending. */
function eachDate(from, to) {
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
 * One line per REQUESTED date, so a date is never silently absent from the
 * context. A date with no row is stated as a confirmed database result, which is
 * the only evidence that permits calling a date missing.
 */
function dailyRowLines(rows, dates) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dates.map((date) => {
    const row = byDate.get(date);
    if (!row) {
      return `  ${date}: NO ARCHIVE ROW (confirmed database result - no value was recorded)`;
    }
    if (row.kwh === null) {
      return `  ${date}: row present but no usable canonical generation value`;
    }
    return `  ${date}: ${row.kwh} kWh (source=${row.source ?? "unknown"}, manual override=${
      row.isManualOverride ? "yes" : "no"
    })`;
  });
}

/** Join a missing-date list, truncating loudly rather than silently. */
function missingList(missingDays) {
  if (!missingDays || missingDays.length === 0) return "none";
  if (missingDays.length <= MAX_MISSING_LISTED) return missingDays.join(", ");
  return `${missingDays.slice(0, MAX_MISSING_LISTED).join(", ")} (+${
    missingDays.length - MAX_MISSING_LISTED
  } more)`;
}

/**
 * @param {{kind: string, label: string, from: string, to: string}} period
 */
function periodLines(period) {
  const lines = [`period: ${period.label}`, `range: ${period.from} to ${period.to}`];

  // Single-date queries are first-class: the exact date, its canonical value and
  // its provenance, plus an unambiguous present/absent verdict.
  if (period.kind === "day") {
    const date = period.date;
    const rows = archiveService.getDailyRows({ from: date, to: date });
    lines.push(`requested date: ${date}`);
    if (rows.length === 0) {
      lines.push(
        `archive row found for ${date}: no`,
        "archived days reported: 0",
        `missing dates: ${date}`,
        `note: the archive database was queried for ${date} and returned no row. This is a confirmed database result, not missing context - report this date as having no recorded generation.`,
      );
      return lines;
    }
    const row = rows[0];
    lines.push(`archive row found for ${date}: yes`);
    lines.push(...dailyRowLines(rows, [date]));
    if (row.kwh !== null) {
      lines.push(`generation kWh: ${row.kwh}`, "archived days reported: 1");
    } else {
      lines.push("archived days reported: 0 (row present but canonical value unresolved)");
    }
    return lines;
  }

  // Whole-month queries keep the existing aggregate rendering: a monthly total,
  // average, best/worst day and coverage note answer "how was August", and
  // listing ~31 daily rows for it is context the model does not need.
  if (period.kind === "month") {
    const monthSummary = archiveService.getRangeSummary({ from: period.from, to: period.to });
    if (!monthSummary) {
      lines.push("archived days reported: 0", "archived data for this period: not available");
      return lines;
    }
    lines.push(`archived days reported: ${monthSummary.daysReported}`);
    const monthCalendarDays = monthSummary.expectedDays ?? spanDays(period.from, period.to);
    lines.push(`expected days in range: ${monthCalendarDays}`);
    if (monthSummary.daysReported < monthCalendarDays) {
      lines.push(
        `note: the range covers ${monthCalendarDays} calendar days but the archive reports only ${monthSummary.daysReported} days`,
      );
      lines.push(
        monthSummary.missingDays && monthSummary.missingDays.length > 0
          ? `missing days: ${monthSummary.missingDays.join(", ")}`
          : "missing days: none",
      );
    }
    lines.push(
      `period total kWh: ${monthSummary.totalKwh}`,
      `daily average kWh/day: ${monthSummary.dailyAverageKwh}`,
      `best day: ${monthSummary.bestDay.kwh} kWh on ${monthSummary.bestDay.date}`,
      `worst day: ${monthSummary.worstDay.kwh} kWh on ${monthSummary.worstDay.date}`,
    );
    return lines;
  }

  const dates = eachDate(period.from, period.to);
  const calendarDays = dates.length;
  const rows = archiveService.getDailyRows({ from: period.from, to: period.to });
  const summary = archiveService.getRangeSummary({ from: period.from, to: period.to });

  lines.push(`requested start date: ${period.from}`);
  lines.push(`requested end date: ${period.to}`);
  lines.push(`expected calendar days: ${calendarDays}`);
  lines.push(`archive rows found: ${rows.length}`);

  if (!summary) {
    lines.push(
      "archived days reported: 0",
      "archived data for this period: not available",
      `missing dates: ${missingList(dates)}`,
      "note: the archive database was queried for this range and returned no usable generation row for any of the requested dates.",
    );
    return lines;
  }

  lines.push(`archived days reported: ${summary.daysReported}`);
  const missingDays =
    summary.missingDays && summary.missingDays.length > 0
      ? summary.missingDays
      : dates.filter((d) => !rows.some((r) => r.date === d));
  lines.push(`missing dates: ${missingList(missingDays)}`);
  if (summary.daysReported < calendarDays) {
    lines.push(
      `note: the range covers ${calendarDays} calendar days but the archive reports only ${summary.daysReported} days`,
    );
  }

  if (calendarDays <= MAX_DAILY_LISTING_DAYS) {
    lines.push(
      "DAILY GENERATION FOR THIS RANGE (canonical EnergyScope values - one line per requested date, authoritative for per-date questions):",
      ...dailyRowLines(rows, dates),
    );
  } else {
    lines.push(
      `note: per-date rows are omitted because the requested range spans ${calendarDays} calendar days (over the ${MAX_DAILY_LISTING_DAYS}-day listing limit). Ask for a narrower window to get exact daily values.`,
    );
  }

  lines.push(
    `period total kWh (sum of the daily rows above): ${summary.totalKwh}`,
    `daily average kWh/day: ${summary.dailyAverageKwh}`,
    `best day: ${summary.bestDay.kwh} kWh on ${summary.bestDay.date}`,
    `worst day: ${summary.worstDay.kwh} kWh on ${summary.worstDay.date}`,
  );
  return lines;
}

/** Deterministic pointer for a current-month lead whose archive is empty: the
 * MEASURED month summary in the static verified block already covers it. */
function currentMonthPointer(period) {
  return /\bcurrent month to date\b/i.test(period.label);
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
      "Each period below has its own authoritative EnergyScope summary, including the exact daily generation for every date that period covers. Answer per-date questions from those exact daily lines. You may describe the difference between the periods - including a plain percentage difference of the totals/averages - but never recompute either period or its daily values.",
      "A date shown as 'NO ARCHIVE ROW' genuinely has no recorded generation; do not present it as zero or estimate it.",
    ];
    resolved.periods.forEach((period, index) => {
      const block = periodLines(period);
      if (
        index === 0 &&
        currentMonthPointer(period) &&
        block.includes("archived data for this period: not available")
      ) {
        block.push(
          "note: this month's MEASURED summary (month-to-date kWh, days recorded, daily average) is in the ENERGYSCOPE VERIFIED DATA block above; the archive has not collected this month yet.",
        );
      }
      lines.push("", `PERIOD ${index + 1}`, ...block);
    });
    return lines.join("\n");
  }

  const block = periodLines(resolved);
  if (
    currentMonthPointer(resolved) &&
    block.includes("archived data for this period: not available")
  ) {
    block.push(
      "note: this month's MEASURED summary (month-to-date kWh, days recorded, daily average) is in the ENERGYSCOPE VERIFIED DATA block above; the archive has not collected this month yet.",
    );
  }
  return [HEADER, ...block].join("\n");
}

module.exports = {
  MAX_RANGE_DAYS,
  resolveHistoricalPeriod,
  buildHistoricalAppendix,
  _internals: {
    resolveSinglePeriod,
    periodLines,
    eachDate,
    dailyRowLines,
    currentMonthPointer,
    monthWindow,
    currentMonthWindow,
    shiftMonthKey,
    addDays,
    spanDays,
    monthPeriod,
  },
};
