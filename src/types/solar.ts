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
  /** kWh, same period previous cycle — used for trend indicators */
  todayPrevious: number;
  monthPrevious: number;
  yearPrevious: number;
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
  kind: "anomaly" | "cleaning" | "inspection" | "offline" | "info";
  title: string;
  detail: string;
  time: string;
  unread: boolean;
}
