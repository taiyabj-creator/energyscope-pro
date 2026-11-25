export type ConnectionStatus = "online" | "offline" | "warning";

export type PlantStatus = "producing" | "standby" | "fault" | "offline";

export interface LivePowerSnapshot {
  timestamp: string;
  /** Watts produced by the PV array */
  solarPower: number;
  plantStatus: PlantStatus;
}

export interface EnergyTotals {
  today: number;
  month: number;
  year: number;
  /**
   * Lifetime/cumulative generation in kWh, read from the UTL inverter's energy
   * counter (`daily_energy_produced` on GET /api/inverter — despite the name it
   * is the all-time cumulative output, verified against the live UTL API).
   * null when UTL returns nothing usable; it is never substituted with an
   * archive total or the inverter's daily counter.
   */
  total: number | null;
  /**
   * kWh for the same period one cycle earlier — used for trend indicators.
   * null means no historical data exists for that period.
   */
  todayPrevious: number | null;
  monthPrevious: number | null;
  yearPrevious: number | null;
}

/**
 * Canonical archive summary for the Energy Summary cards' Archive source
 * (served by /api/archive/summary). Dates are Asia/Kolkata calendar days and
 * values use canonicalGeneration precedence. null means "no archived record for
 * this period yet" — never a zero.
 */
export interface ArchiveEnergySummary {
  /** IST date string the summary was computed for, e.g. "2026-09-24". */
  asOfDate: string;
  today: number | null;
  /** ms-since-epoch of the last write to today's rolling archive row; null = not archived yet. */
  todayUpdatedAt: number | null;
  todayPrevious: number | null;
  month: number | null;
  monthPrevious: number | null;
  /** Archived days reported for the current month (1st .. monthLatest). */
  monthDays: number;
  /** Day-of-month of the latest archived day in the current month (0 = none). */
  monthExpectedDays: number;
  monthLatest: string | null;
  year: number | null;
  yearPrevious: number | null;
  /** Archived days reported for the current year (yearFirst .. yearLatest). */
  yearDays: number;
  yearFirst: string | null;
  yearLatest: string | null;
  firstDataDate: string | null;
  latestDate: string | null;
}

export interface BatteryState {
  installed: boolean;
  soc: number | null;
  power: number | null;
  charging: boolean | null;
  capacityKwh: number | null;
}

export interface PlantInfo {
  name: string;
  ownerName: string;
  capacityKw: number;
  systemType?: "on-grid" | "hybrid" | "off-grid";
  location: string;
  latitude: number;
  longitude: number;
  installationDate: string;
  tiltDegrees?: number;
  azimuth?: string;
}

export interface InverterInfo {
  model: string;
  serial: string;
  firmware: string;
  status: ConnectionStatus;
  acVoltage: number;
  acCurrent?: number;
  acFrequency: number;
  acPower?: number;
  dcVoltage: number;
  dcCurrent: number;
  dcPower?: number;
  powerFactor?: number | null;
  efficiency?: number | null;
  temperatureC: number;
}

export interface LoggerInfo {
  model: string;
  serial: string;
  firmware: string;
  status: ConnectionStatus;
  wifiSsid: string;
  rssiDbm: number;
  lastCommunication: string;
}

export interface SeriesPoint {
  label: string;
  value: number;
  /** optional secondary series, e.g. consumption or previous period */
  compare?: number;
  /** minutes since midnight for Day-series samples (UTL timeMinutes) */
  timeMinutes?: number;
}

export type EnergyRange = "day" | "month" | "year" | "total";

export interface DailyHistoryRow {
  date: string;
  generation: number;
  /** Operator-recorded "inverter off" day: 0 kWh by reason, not by measurement. */
  inverterOff?: boolean;
}

export interface MonthlyHistoryRow {
  month: string;
  generation: number;
}

export interface YearlyHistoryRow {
  year: string;
  generation: number;
}

export interface HeatmapCell {
  month: string;
  day: number;
  value: number;
}

export interface AnalyticsSummary {
  bestDay: { date: string; generation: number };
  worstDay: { date: string; generation: number };
  averageDaily: number;
  specificYield: number;
  performanceRatio: null;
  /**
   * Percentage change from the latest COMPLETED calendar month to the one
   * immediately before it. null when the comparison is not computable (e.g. the
   * two latest months are not consecutive, or there is only one recorded month)
   * — never a misleading 0.
   */
  monthOverMonthPct: number | null;
}

export interface AnalyticsData {
  summary: AnalyticsSummary | null;
  monthlyTrend: SeriesPoint[];
  heatmap: HeatmapCell[];
  currentMonthAverage: number | null;
  /** Canonical recorded days contributing to this year's analytics. */
  daysReported: number;
  /** Archive coverage for the selected year (null bounds when empty). */
  coverage: { firstDate: string | null; latestDate: string | null };
}

export interface WeatherNow {
  condition: string;
  weatherCode: number;
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKph: number;
  windDirection: string;
  cloudCoverPct: number;
  rainProbabilityPct: number;
  pressureHpa: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  windGustsKph: number;
  precipitationMm: number;
}

export interface WeatherHour {
  time: string;
  weatherCode: number;
  temperatureC: number;
  rainProbabilityPct: number;
  cloudCoverPct: number;
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  highC: number;
  lowC: number;
  rainProbabilityPct: number;
  windSpeedKph: number;
  uvIndex: number;
  cloudCoverPct: number;
  precipitationMm: number;
  sunrise: string;
  sunset: string;
  daylightDurationS: number;
}

export interface WeatherData {
  current: WeatherNow;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface MaintenanceEvent {
  id: string;
  date: string;
  type: "cleaning" | "inspection" | "repair" | "installation";
  title: string;
  note: string;
}

export interface MaintenanceState {
  installationDate: string;

  lastCleaning: string;
  lastInspection: string;
  healthScore: number;

  nextCleaning: string;
  nextInspection: string;

  cleaningDueIn: number;
  inspectionDueIn: number;

  healthFactors: { label: string; score: number; weightPct: number }[];
  timeline: MaintenanceEvent[];
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  /** Display-ready timestamp in 12-hour IST form, e.g. "Today, 6:42 PM". */
  time: string;
  unread: boolean;
  url?: string | null;
}

/**
 * Unauthenticated backend health payload (`GET /api/health`). `version` is the
 * application version mirrored from package.json, so the diagnostics page can
 * report the running backend instead of a hardcoded label.
 */
export interface BackendHealth {
  status: string;
  uptime: number;
  timestamp: string;
  version: string;
}

/**
 * Owner/account identity read live from the UTL portal
 * (`GET /api/auth/profile`). `name` is null when neither the portal nor a
 * cached copy is available — the UI then falls back to a neutral label rather
 * than inventing a personal name.
 */
export interface OwnerProfile {
  name: string | null;
  email: string | null;
  role: string | null;
  business: string | null;
  /** `live` = just fetched, `cache` = last known good, `unavailable` = neither. */
  source: "live" | "cache" | "unavailable";
}

/**
 * Lifetime environmental & economic estimates (`GET /api/archive/benefits`).
 * The energy figure comes from the UTL inverter's cumulative lifetime counter;
 * `generation_source` is "archive" only while the logger is unreachable.
 */
export interface EnvironmentalBenefits {
  generation_kwh: number;
  generation_source: "utl_logger" | "archive";
  observed_at: string | null;
  co2_avoided_kg: number;
  coal_saved_kg: number;
  trees_equivalent: number;
  savings_inr: number;
  tariff_inr_per_kwh: number;
  factors: {
    co2_kg_per_kwh: number;
    coal_kg_per_kwh: number;
    tree_kg_co2_per_year: number;
  };
  days_reported: number | null;
  first_day: string | null;
  last_day: string | null;
}

/**
 * Plant records & milestones (`GET /api/archive/records`), computed on read from
 * the canonical archive. Every figure is derived from archived daily generation
 * (or the stored intraday curves for peak power), never from a second aggregate.
 */
export interface PlantRecords {
  coverage: {
    first_day: string;
    last_day: string;
    archived_days: number;
    days_reported: number;
    expected_days: number;
    missing_days: number;
    inverter_off_days: number;
  };
  /**
   * Lifetime figure and the pre-coverage gap. `generation_source` is
   * `utl_logger` when the inverter's own cumulative counter answered (the
   * authoritative lifetime value) and `archive` while it is unreachable.
   * `pre_coverage_kwh` is lifetime minus archived output, but it is only
   * non-zero when the archive has no missing days — otherwise the difference
   * includes unrecorded archive energy and cannot date anything.
   */
  lifetime: {
    generation_kwh: number;
    generation_source: "utl_logger" | "archive";
    observed_at: string | null;
    archive_total_kwh: number;
    pre_coverage_kwh: number;
    pre_coverage_applied: boolean;
  };
  highest_day: { date: string; kwh: number } | null;
  highest_month: {
    month: string;
    kwh: number;
    days_reported: number;
    days_expected: number;
    complete: boolean;
  } | null;
  highest_power: {
    date: string;
    watts: number;
    time_minutes: number | null;
    curve_days: number;
  } | null;
  /**
   * Milestones. Only the first one may be `estimated`: the plant generated
   * before archive coverage began, so its true 1 MWh date is derived by
   * subtracting the pre-coverage gap from 1,000 kWh and reading the archived
   * cumulative crossing of that target. Later milestones are plain archive
   * crossings (`offset_kwh` 0).
   */
  milestones: {
    method: string;
    coverage_start: string;
    archive_complete: boolean;
    pre_coverage_applied: boolean;
    lifetime_kwh: number;
    lifetime_source: "utl_logger" | "archive";
    archive_total_kwh: number;
    pre_coverage_kwh: number;
    items: Array<{
      threshold_kwh: number;
      label: string;
      achieved_on: string | null;
      estimated: boolean;
      basis: "archive_cumulative" | "estimated_pre_coverage_offset";
      achieved_before_coverage: boolean;
      offset_kwh: number;
      progress_pct: number;
      estimate?: {
        target_archive_kwh: number;
        cumulative_before_kwh: number;
        day_kwh: number;
        fraction_of_day: number;
      } | null;
    }>;
  };
  streaks: {
    longest: { from: string; to: string; days: number } | null;
    current: { from: string; to: string; days: number } | null;
  };
  best_month: {
    month: string;
    kwh: number;
    average_kwh: number;
    days_reported: number;
    days_expected: number;
    complete: boolean;
  } | null;
  best_year: {
    year: string;
    kwh: number;
    days_reported: number;
    days_expected: number;
    complete: boolean;
  } | null;
  record_days: {
    count: number;
    latest: Array<{ date: string; kwh: number; previous_best_kwh: number }>;
  };
}
