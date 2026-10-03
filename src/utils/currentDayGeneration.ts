/**
 * "Today's generation" must be generation for the current Asia/Kolkata (IST)
 * calendar day and nothing else.
 *
 * UTL's InverterDevice `daily_production` scalar carries no date of its own: it
 * keeps reporting whatever the logger last delivered. Once the logger stops
 * reporting, that value is usually the *previous* day's completed total, so it
 * must never be shown as today's yield.
 *
 * UTL timestamps are naive IST wall-clock strings ("2026-10-03 17:34:50") with
 * no UTC offset — confirmed against the archived power-curve samples for the
 * same day, whose final sample matches the reported clock time. They are
 * therefore read as IST calendar dates and never re-interpreted as
 * browser-local time.
 */

const IST_DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current Asia/Kolkata calendar day as "YYYY-MM-DD". */
export function istTodayKey(now: Date = new Date()): string {
  return IST_DATE_KEY.format(now);
}

/**
 * IST calendar day a reading belongs to, taken from the reading's own
 * timestamp. Returns null when the payload exposes no usable date, which means
 * the caller must fall back to live current-day signals instead of trusting
 * the scalar value.
 */
export function readingIstDateKey(readingTimestamp?: string | null): string | null {
  if (typeof readingTimestamp !== "string") return null;

  const match = readingTimestamp.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export type GenerationDayConfidence = "current-day" | "stale" | "unknown";

export interface CurrentDayGenerationSignals {
  /** UTL InverterDevice.timestamp — the clock time of the reading itself. */
  readingTimestamp?: string | null | undefined;
  /** Whether UTL currently reports the logger as connected. */
  loggerOnline?: boolean | undefined;
  /** Samples already present in the current IST day's power series. */
  currentDaySampleCount?: number | undefined;
  /** Injected by tests. */
  now?: Date | undefined;
}

/**
 * Classify a "today" generation reading before the dashboard is allowed to
 * show it.
 *
 * - Dated today      -> "current-day". This is also what keeps a total collected
 *   before the logger drops out later the same day on screen, because the
 *   reading keeps today's date.
 * - Dated earlier    -> "stale". A previous day's total; show 0.
 * - No usable date   -> "unknown", resolved from the current-day signals the
 *   dashboard already holds: a live logger, or a non-empty series for the day.
 *   Both prove the value belongs to today; without either, show 0.
 *
 * Never returns "unknown": an undated reading is resolved by live signals, so
 * a missing date degrades to "stale" rather than to blind trust.
 */
export function classifyCurrentDayGeneration({
  readingTimestamp,
  loggerOnline,
  currentDaySampleCount,
  now = new Date(),
}: CurrentDayGenerationSignals): GenerationDayConfidence {
  const readingDate = readingIstDateKey(readingTimestamp);

  if (readingDate) {
    return readingDate === istTodayKey(now) ? "current-day" : "stale";
  }

  if (loggerOnline) return "current-day";
  if ((currentDaySampleCount ?? 0) > 0) return "current-day";

  return "stale";
}
