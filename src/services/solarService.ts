/** UTL-backed service layer. */
import { apiRequest } from "@/api/client";
import type {
  AnalyticsData,
  AnalyticsSummary,
  DailyHistoryRow,
  EnergyRange,
  EnergyTotals,
  InverterInfo,
  LivePowerSnapshot,
  LoggerInfo,
  MaintenanceState,
  MonthlyHistoryRow,
  NotificationItem,
  PlantInfo,
  SeriesPoint,
  WeatherData,
  YearlyHistoryRow,
} from "@/types/solar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface UtlInverter {
  timestamp: string;
  total_ac_power: string | number;
  inverter_status: number;
  logger_status: string;
  daily_production: string | number;
  daily_energy_produced: string | number;
  dc_power_1: string | number;
  inverter_type_description: string;
  sno: string;
  control_software_version?: string;
  ac_voltage_a: string | number;
  ac_output_frequency: string | number;
  dc_voltage_1: string | number;
  dc_current_1: string | number;
  temperature_1: string | number;
  module_mac_address: string;
  comm_software_version_1?: string;
  router_ssid: string;
  signal_strength: number;
}

interface ChartPoint {
  PvProduction?: number | string;
  timeMinutes?: number;
  date?: string | number;
  month?: string | number;
  year?: string | number;
}

interface ChartResponse {
  results?: ChartPoint[];
}

type EnergySource = "daily" | "monthly" | "yearly" | "total";

async function fetchUtlInverter(): Promise<UtlInverter> {
  const json = await apiRequest<{ data: UtlInverter }>("/inverter");

  return json.data;
}

async function fetchChart(endpoint: string): Promise<ChartResponse> {
  return apiRequest<ChartResponse>(endpoint);
}

function getLoggerStatus(
  inverter: UtlInverter
): "online" | "offline" | "warning" {
  switch (String(inverter.logger_status)) {
    case "1":
      return "online";

    case "2":
      return "warning";

    case "3":
      return "offline";

    default:
      return "offline";
  }
}

/**
 * Normalizes UTL chart values to kWh at the service boundary.
 * Daily values are instantaneous power in kW, while monthly values are kWh.
 * The yearly and total chart endpoints report MWh and must be converted once.
 */
function normalizeEnergyUnit(value: unknown, source: EnergySource): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;

  return source === "yearly" || source === "total" ? numericValue * 1000 : numericValue;
}

function sumPvProductionKwh(results: unknown, source: Exclude<EnergySource, "daily">): number {
  if (!Array.isArray(results)) return 0;

  return results.reduce((total, row) => total + normalizeEnergyUnit(row?.PvProduction, source), 0);
}

function chartValue(point: ChartPoint, source: EnergySource): number {
  return normalizeEnergyUnit(point.PvProduction, source);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: ChartPoint["month"]): string {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? MONTHS[month - 1]!
    : String(value ?? "—");
}

function chartDate(value: ChartPoint["date"], year: number, monthIndex: number): string | null {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const day = Number(raw);
  return Number.isInteger(day) && day >= 1 && day <= 31
    ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

export async function fetchLivePower(): Promise<LivePowerSnapshot> {
  const inv = await fetchUtlInverter();

  const loggerOffline = getLoggerStatus(inv) !== "online";

  return {
    timestamp: inv.timestamp,

    solarPower: loggerOffline
      ? 0
      : Number(inv.total_ac_power) * 1000,

    plantStatus:
      loggerOffline
        ? "standby"
        : inv.inverter_status === 1
          ? "producing"
          : "standby",
  };
}

export async function fetchEnergyTotals(): Promise<EnergyTotals> {
  const currentYear = new Date().getFullYear();
  const [inverter, month, year] = await Promise.all([
  fetchUtlInverter(),
  fetchChart("/charts/monthly"),
  fetchChart(`/charts/yearly?year=${currentYear}`),
]);

  return {
    today: Number(inverter.daily_production),

    month: sumPvProductionKwh(month.results, "monthly"),

    // The yearly endpoint returns one kWh value per month; sum it directly.
    year: sumPvProductionKwh(year.results, "yearly"),

    // InverterDevice's cumulative counter is the only lifetime value exposed by UTL.
    // /charts/total is a historical chart series, not a plant lifetime total.
    total: Number(inverter.daily_energy_produced),

    todayPrevious: 0,
    monthPrevious: 0,
    yearPrevious: 0,
  };
}

export async function fetchPlantInfo(): Promise<PlantInfo> {
  const config = await apiRequest<{
  name: string;
  capacity: number;
  location: string;
  latitude: number;
  longitude: number;
}>("/plant-config");

  return {
    name: config.name,
    ownerName: "Jamal",
    capacityKw: config.capacity,
    location: config.location,
    installationDate: "2026-07-06",
    latitude: config.latitude,
    longitude: config.longitude,
  };
}

export async function fetchInverter(): Promise<InverterInfo> {
  const inv = await fetchUtlInverter();

  const loggerOffline = getLoggerStatus(inv) !== "online";

  const dcPower = loggerOffline ? 0 : Number(inv.dc_power_1);
  const acPower = loggerOffline ? 0 : Number(inv.total_ac_power);

  return {
    model: inv.inverter_type_description,
    serial: inv.sno,
    firmware: inv.control_software_version ?? "Unknown",
    // Inverter operation is reported by the inverter field; it is not a logger
    // connectivity signal.
    status: inv.inverter_status === 1 ? "online" : "warning",

    acVoltage: loggerOffline ? 0 : Number(inv.ac_voltage_a),
    acFrequency: loggerOffline ? 0 : Number(inv.ac_output_frequency),

    dcVoltage: loggerOffline ? 0 : Number(inv.dc_voltage_1),
    dcCurrent: loggerOffline ? 0 : Number(inv.dc_current_1),

    temperatureC: Number(inv.temperature_1),

   
  };
}

export async function fetchLogger(): Promise<LoggerInfo> {
  const inv = await fetchUtlInverter();

  return {
    model: "UTL WiFi Logger",
    serial: inv.module_mac_address,
    firmware: inv.comm_software_version_1 ?? "Unknown",
  
    status: getLoggerStatus(inv),

    wifiSsid: inv.router_ssid,
    rssiDbm: inv.signal_strength,
    lastCommunication: inv.timestamp,

    // keep the rest exactly as it was...
  };
}

export async function fetchEnergySeries(
  range: EnergyRange,
  selectedDate: Date,
): Promise<SeriesPoint[]> {
  const day = selectedDate.toISOString().slice(0, 10);

  const month =
    selectedDate.getFullYear() + "-" + String(selectedDate.getMonth() + 1).padStart(2, "0");

  const year = String(selectedDate.getFullYear());

  if (range === "day") {
    const data = await fetchChart(`/charts/daily?date=${day}`)

    

    return (data.results ?? []).map((p) => {
      const timeMinutes = p.timeMinutes ?? 0;
      const hour = Math.floor(timeMinutes / 60);
      const minute = timeMinutes % 60;

      return {
        label: String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0"),
        value: chartValue(p, "daily"),
        compare: 0,
      };
    });
  }

    if (range === "month") {
    const data = await fetchChart(
      `/charts/monthly?month=${month}`
    );

    const daysInMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    ).getDate();

    const values = new Map(
      (data.results ?? []).map((p) => [
        Number(p.date),
        chartValue(p, "monthly"),
      ])
    );

    return Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      value: values.get(i + 1) ?? 0,
      compare: 0,
    }));
  }
  if (range === "year") {
    const data = await fetchChart(`/charts/yearly?year=${year}`)

    return (data.results ?? []).map((p) => ({
      label: monthLabel(p.month),
      value: chartValue(p, "yearly"),
      compare: 0,
    }));
  }

  const data = await fetchChart("/charts/total")

  return (data.results ?? []).map((p) => ({
    label: String(p.year),
    value: chartValue(p, "total"),
    compare: 0,
  }));
}

export async function fetchDailyHistory(selectedDate: Date): Promise<DailyHistoryRow[]> {
  const data = await fetchChart(
   `/charts/monthly?month=${monthKey(selectedDate)}`
  );
  return (data.results ?? [])
    .map((point) => ({
      date: chartDate(point.date, selectedDate.getFullYear(), selectedDate.getMonth()),
      generation: chartValue(point, "monthly"),
    }))
    .filter((point): point is DailyHistoryRow => point.date !== null);
}

export async function fetchMonthlyHistory(year: number): Promise<MonthlyHistoryRow[]> {
  const data = await fetchChart(`/charts/yearly?year=${year}`)
  return (data.results ?? []).map((point) => ({
    month: monthLabel(point.month),
    generation: chartValue(point, "yearly"),
  }));
}

export async function fetchYearlyHistory(): Promise<YearlyHistoryRow[]> {
  const data = await fetchChart("/charts/total")
  return (data.results ?? []).map((point) => ({
    year: String(point.year),
    generation: chartValue(point, "total"),
  }));
}

export async function fetchAnalyticsData(year = new Date().getFullYear()): Promise<AnalyticsData> {
  const [plant, yearly, ...monthlyResponses] = await Promise.all([
  fetchPlantInfo(),
  fetchChart(`/charts/yearly?year=${year}`),
  ...Array.from({ length: 12 }, (_, month) =>
      fetchChart(
        `/charts/monthly?month=${year}-${String(month + 1).padStart(2, "0")}`,
      ),
    ),
  ]);

  const dailyRows = monthlyResponses.flatMap((response, monthIndex) =>
    (response.results ?? []).flatMap((point) => {
      const date = chartDate(point.date, year, monthIndex);
      return date ? [{ point, date }] : [];
    }),
  );
  const heatmap = dailyRows.map(({ point, date }) => ({
    month: MONTHS[Number(date.slice(5, 7)) - 1]!,
    day: Number(date.slice(8, 10)),
    value: chartValue(point, "monthly"),
  }));
  const usableDays = dailyRows.filter(({ point }) => chartValue(point, "monthly") > 0);
  const monthlyTrend = (yearly.results ?? []).map((point) => ({
    label: String(point.month),
    value: chartValue(point, "yearly"),
  }));
  const yearProduction = monthlyTrend.reduce((total, point) => total + point.value, 0);
  const values = monthlyTrend.map((point) => point.value).filter((value) => value > 0);
  const monthOverMonthPct =
    values.length > 1 ? ((values.at(-1)! - values.at(-2)!) / values.at(-2)!) * 100 : 0;

  const best = usableDays.reduce<(typeof usableDays)[number] | null>(
    (current, row) =>
      !current || chartValue(row.point, "monthly") > chartValue(current.point, "monthly")
        ? row
        : current,
    null,
  );
  const worst = usableDays.reduce<(typeof usableDays)[number] | null>(
    (current, row) =>
      !current || chartValue(row.point, "monthly") < chartValue(current.point, "monthly")
        ? row
        : current,
    null,
  );

  const summary: AnalyticsSummary | null =
    best && worst
      ? {
          bestDay: { date: best.date, generation: chartValue(best.point, "monthly") },
          worstDay: { date: worst.date, generation: chartValue(worst.point, "monthly") },
          averageDaily:
            usableDays.reduce((total, row) => total + chartValue(row.point, "monthly"), 0) /
            usableDays.length,
          specificYield: plant.capacityKw > 0 ? yearProduction / plant.capacityKw : 0,
          performanceRatio: null,
          monthOverMonthPct,
        }
      : null;

  const currentMonth = monthlyResponses[new Date().getMonth()]?.results ?? [];
  const currentMonthAverage = currentMonth.length
    ? currentMonth.reduce((total, point) => total + chartValue(point, "monthly"), 0) /
      currentMonth.length
    : null;

  return { summary, monthlyTrend, heatmap, currentMonthAverage };
}

/**
 * The current UTL backend has no weather endpoint. Returning `null` keeps the
 * interface ready for a future backend integration without presenting mock
 * forecasts or irradiance as plant data.
 */
export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherData> {
  try {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: "auto",
      forecast_days: "7",
      current:
        "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,precipitation_probability,precipitation,uv_index",
      hourly: "temperature_2m,weather_code,precipitation_probability,cloud_cover",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,cloud_cover_mean,sunrise,sunset,daylight_duration",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    if (!response.ok) throw new Error("Weather service unavailable");

    const data = (await response.json()) as OpenMeteoResponse;
    if (!data.current || !data.hourly || !data.daily)
      throw new Error("Weather service unavailable");

    const sunrise = data.daily.sunrise?.[0] ?? "";
    const sunset = data.daily.sunset?.[0] ?? "";
    const currentTime = data.current.time ?? "";
    const hourlyData = data.hourly ?? {};
    const dailyData = data.daily ?? {};
    const hours = (hourlyData.time ?? [])
      .map((time, index) => ({
        time,
        weatherCode: numberAt(hourlyData.weather_code, index),
        temperatureC: numberAt(hourlyData.temperature_2m, index),
        rainProbabilityPct: numberAt(hourlyData.precipitation_probability, index),
        cloudCoverPct: numberAt(hourlyData.cloud_cover, index),
      }))
      .filter((hour) => hour.time >= currentTime)
      .slice(0, 24);

    return {
      current: {
        condition: weatherDescription(data.current.weather_code),
        weatherCode: data.current.weather_code ?? 0,
        temperatureC: data.current.temperature_2m ?? 0,
        feelsLikeC: data.current.apparent_temperature ?? 0,
        humidityPct: data.current.relative_humidity_2m ?? 0,
        windKph: data.current.wind_speed_10m ?? 0,
        windGustsKph: data.current.wind_gusts_10m ?? 0,
        windDirection: windDirection(data.current.wind_direction_10m),
        cloudCoverPct: data.current.cloud_cover ?? 0,
        rainProbabilityPct: data.current.precipitation_probability ?? 0,
        precipitationMm: data.current.precipitation ?? 0,
        pressureHpa: data.current.surface_pressure ?? 0,
        uvIndex: data.current.uv_index ?? 0,
        sunrise: formatWeatherTime(sunrise),
        sunset: formatWeatherTime(sunset),
      },
      hourly: hours,
      daily: (dailyData.time ?? []).map((date, index) => ({
        date,
        weatherCode: numberAt(dailyData.weather_code, index),
        highC: numberAt(dailyData.temperature_2m_max, index),
        lowC: numberAt(dailyData.temperature_2m_min, index),
        rainProbabilityPct: numberAt(dailyData.precipitation_probability_max, index),
        windSpeedKph: numberAt(dailyData.wind_speed_10m_max, index),
        uvIndex: numberAt(dailyData.uv_index_max, index),
        cloudCoverPct: numberAt(dailyData.cloud_cover_mean, index),
        precipitationMm: numberAt(dailyData.precipitation_sum, index),
        sunrise: formatWeatherTime(dailyData.sunrise?.[index] ?? ""),
        sunset: formatWeatherTime(dailyData.sunset?.[index] ?? ""),
        daylightDurationS: numberAt(dailyData.daylight_duration, index),
      })),
    };
  } catch {
    throw new Error("Weather service unavailable");
  }
}

interface OpenMeteoResponse {
  current?: {
  time?: string;
  temperature_2m?: number;
  apparent_temperature?: number;
  relative_humidity_2m?: number;
  surface_pressure?: number;
  cloud_cover?: number;
  wind_speed_10m?: number;
  wind_gusts_10m?: number;
  wind_direction_10m?: number;
  weather_code?: number;
  precipitation_probability?: number;
  precipitation?: number;
  uv_index?: number;
  };
  hourly?: {
  time?: string[];
  temperature_2m?: number[];
  weather_code?: number[];
  precipitation_probability?: number[];
  cloud_cover?: number[];
  };
  daily?: {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  wind_speed_10m_max?: number[];
  uv_index_max?: number[];
  cloud_cover_mean?: number[];
  sunrise?: string[];
  sunset?: string[];
  daylight_duration?: number[];
  };
}


function numberAt(values: number[] | undefined, index: number) {
  return values?.[index] ?? 0;
}

function formatWeatherTime(value: string) {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? "Not available";
}

function windDirection(degrees: number | undefined) {
  if (degrees === undefined) return "";
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8]!;
}

function weatherDescription(code: number | undefined) {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code ?? -1)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return "Snow";
  if ([95, 96, 99].includes(code ?? -1)) return "Thunderstorm";
  return "Unknown conditions";
}

export async function fetchMaintenance(): Promise<MaintenanceState> {
  const plant = await fetchPlantInfo();

  const maintenance = await apiRequest<any>("/maintenance");

  
  return {
    installationDate: plant.installationDate,

    lastCleaning: maintenance.lastCleaning,
    lastInspection: maintenance.lastInspection,

    nextCleaning: maintenance.nextCleaning,
    nextInspection: maintenance.nextInspection,

    cleaningDueIn: maintenance.cleaningDueIn,
    inspectionDueIn: maintenance.inspectionDueIn,

    healthScore: 100,

    healthFactors: [
      {
        label: "Cleaning schedule",
        score: maintenance.cleaningDueIn >= 0 ? 100 : 70,
        weightPct: 50,
      },
      {
        label: "Inspection schedule",
        score: maintenance.inspectionDueIn >= 0 ? 100 : 70,
        weightPct: 50,
      },
    ],

    timeline: maintenance.history,
  };
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return [
    {
      id: "n1",
      kind: "anomaly",
      title: "Production below expectation",
      detail: "Yesterday produced 14% less than clear-sky estimate for similar weather.",
      time: "2h ago",
      unread: true,
    },
    {
      id: "n2",
      kind: "cleaning",
      title: "Cleaning suggested",
      detail: "Peak power has declined over 5 consecutive clear days.",
      time: "Yesterday",
      unread: true,
    },
    {
      id: "n3",
      kind: "inspection",
      title: "Inspection due in 21 days",
      detail: "Last inspection was on 19 May 2026.",
      time: "3d ago",
      unread: false,
    },
    {
      id: "n4",
      kind: "offline",
      title: "Logger reconnected",
      detail: "Data gap of 11 minutes was backfilled.",
      time: "4d ago",
      unread: false,
      
    },
  ];
}
type PredictionResponse = {
  success: boolean;

  currentEnergy: number;
  expectedToday: number;

  difference: number;
  differenceLabel: string;
  forecastPercent: number;
  
  completion: number;
  monthAverage: number;
  progress: number;

  performance: {
    score: number;
    status: string;
  };

  rank: {
    position: number;
    totalDays: number;
    label: string;
    subtitle: string;
  };
};

export async function fetchPrediction(): Promise<PredictionResponse> {
  return apiRequest<PredictionResponse>("/prediction/today");
}