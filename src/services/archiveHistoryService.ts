/**
 * EnergyScope Archive adapters for the History page.
 *
 * Every function returns the SAME row shapes the existing UTL history
 * service produces (DailyHistoryRow / MonthlyHistoryRow / YearlyHistoryRow),
 * so the existing History chart/table components render both sources
 * without duplication.
 *
 * Unit rule: the archive stores authoritative kWh (collector integrates the
 * UTL W-samples -> Wh -> kWh upstream). These adapters therefore consume
 * archive values verbatim - NO further conversion, and specifically NONE of
 * the UTL yearly/total x1000 normalization that lives in solarService.ts.
 */
import { apiRequest } from "@/api/client";
import type { DailyHistoryRow, MonthlyHistoryRow, YearlyHistoryRow } from "@/types/solar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ArchiveEnvelope<T> {
  success: boolean;
  data?: T;
}

interface ArchiveDailyRecord {
  generation_date: string;
  generation_kwh: number;
}

interface ArchiveAggregate {
  month?: string;
  year?: string;
  generation_kwh: number;
  days_reported?: number;
}

interface ArchiveCoverage {
  earliest?: string | null;
  latest?: string | null;
  daysArchived?: number;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/** Tolerates 404 "no data" responses by resolving to null. */
async function getArchiveData<T>(endpoint: string): Promise<T | null> {
  try {
    const json = await apiRequest<ArchiveEnvelope<T>>(endpoint);
    return json.success && json.data !== undefined ? json.data : null;
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) return null;
    throw error;
  }
}

/** Every archived day within one calendar month, oldest first. */
export async function fetchArchiveMonthDays(
  year: number,
  monthIndex: number,
): Promise<DailyHistoryRow[]> {
  const prefix = `${year}-${pad2(monthIndex + 1)}`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  const records = await getArchiveData<ArchiveDailyRecord[]>(
    `/api/archive/daily?from=${prefix}-01&to=${prefix}-${pad2(lastDay)}`,
  );

  return (records ?? []).map((record) => ({
    date: record.generation_date,
    generation: Number(record.generation_kwh),
  }));
}

/** One SQL-aggregated value per month of the given year (missing months skipped). */
export async function fetchArchiveYearMonths(year: number): Promise<MonthlyHistoryRow[]> {
  const settled = await Promise.allSettled(
    MONTHS.map((_label, index) =>
      getArchiveData<ArchiveAggregate>(`/api/archive/monthly?month=${year}-${pad2(index + 1)}`),
    ),
  );

  return settled.flatMap((outcome, index) =>
    outcome.status === "fulfilled" && outcome.value !== null
      ? [{ month: MONTHS[index]!, generation: Number(outcome.value.generation_kwh) }]
      : [],
  );
}

/** Every year covered by the archive (derived from coverage, aggregated per year). */
export async function fetchArchiveYears(): Promise<YearlyHistoryRow[]> {
  const coverage = await getArchiveData<ArchiveCoverage>("/api/archive/status");
  if (!coverage?.earliest || !coverage?.latest) return [];

  const firstYear = Number(coverage.earliest.slice(0, 4));
  const lastYear = Number(coverage.latest.slice(0, 4));
  if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || lastYear < firstYear) {
    return [];
  }

  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  const settled = await Promise.allSettled(
    years.map((year) => getArchiveData<ArchiveAggregate>(`/api/archive/yearly?year=${year}`)),
  );

  return settled.flatMap((outcome, index) =>
    outcome.status === "fulfilled" && outcome.value !== null
      ? [{ year: String(years[index]), generation: Number(outcome.value.generation_kwh) }]
      : [],
  );
}

/** Single lifetime aggregate over all archived daily records. */
export async function fetchArchiveTotal(): Promise<YearlyHistoryRow[]> {
  const totals = await getArchiveData<{
    generation_kwh: number;
    days_reported?: number;
    first_day?: string;
    last_day?: string;
  }>("/api/archive/total");

  if (!totals) return [];

  const period =
    totals.first_day && totals.last_day ? `${totals.first_day} – ${totals.last_day}` : "Lifetime";

  return [{ year: period, generation: Number(totals.generation_kwh) }];
}
