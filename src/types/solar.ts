export type ConnectionStatus = "online" | "offline" | "warning";

export type PlantStatus = "producing" | "standby" | "fault" | "offline";

export interface LivePowerSnapshot {
  timestamp: string;
  /** Watts produced by the PV array */
  solarPower: number;
  /** Watts consumed by the site */
  loadPower: number;
  /** Positive = importing from grid, negative = exporting to grid (Watts) */
  gridPower: number;
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
  systemType: "on-grid" | "hybrid" | "off-grid";
  location: string;
  latitude: number;
  longitude: number;
  installationDate: string;
  tiltDegrees: number;
  azimuth: string;
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
  efficiencyPct: number;
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
  peakPower: number;
  sunHours: number;
  weather: string;
}

export interface MonthlyHistoryRow {
  month: string;
  generation: number;
  bestDay: number;
  averageDaily: number;
}

export interface YearlyHistoryRow {
  year: string;
  generation: number;
  averageDaily: number;
  performanceRatio: number;
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
  performanceRatio: number;
  monthOverMonthPct: number;
}

export interface WeatherNow {
  condition: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKph: number;
  windDirection: string;
  cloudCoverPct: number;
  irradianceWm2: number;
  rainProbabilityPct: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherForecastDay {
  day: string;
  condition: string;
  highC: number;
  lowC: number;
  cloudCoverPct: number;
  rainProbabilityPct: number;
  expectedKwh: number;
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
