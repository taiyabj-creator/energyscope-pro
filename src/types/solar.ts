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
  total: number;
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
  acFrequency: number;
  dcVoltage: number;
  dcCurrent: number;
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
  monthOverMonthPct: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary | null;
  monthlyTrend: SeriesPoint[];
  heatmap: HeatmapCell[];
  currentMonthAverage: number | null;
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
