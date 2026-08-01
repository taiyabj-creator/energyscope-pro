/**
 * Mock service layer.
 *
 * Every function here returns a Promise so a real UTL API client (axios/fetch)
 * can replace the body without touching any component. No endpoints are
 * invented — these are local placeholders only.
 */
import type {
  AnalyticsSummary,
  BatteryState,
  DailyHistoryRow,
  EnergyRange,
  EnergyTotals,
  HeatmapCell,
  HeatmapCell as Cell,
  InverterInfo,
  LivePowerSnapshot,
  LoggerInfo,
  MaintenanceState,
  MonthlyHistoryRow,
  NotificationItem,
  PlantInfo,
  SeriesPoint,
  WeatherForecastDay,
  WeatherNow,
  YearlyHistoryRow,
} from "@/types/solar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAPACITY_W = 4305;

function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Bell-shaped solar curve for a given hour of day (0 at night). */
function pvCurve(hour: number, cloudFactor = 1) {
  if (hour < 6 || hour > 18.5) return 0;
  const shape = Math.cos(((hour - 12.2) / 6.4) * (Math.PI / 2));
  return Math.max(0, CAPACITY_W * 0.92 * shape ** 1.6 * cloudFactor);
}

export const plantInfo: PlantInfo = {
  name: "Sunfield Residence",
  ownerName: "Rahul",
  capacityKw: 4.305,
  systemType: "on-grid",
  location: "Jaipur, Rajasthan, IN",
  latitude: 26.9124,
  longitude: 75.7873,
  installationDate: "2023-03-14",
  tiltDegrees: 22,
  azimuth: "South (180°)",
};

export const battery: BatteryState = {
  installed: false,
  soc: null,
  power: null,
  charging: null,
  capacityKwh: null,
};

export async function fetchLivePower(): Promise<LivePowerSnapshot> {
  const response = await fetch("http://localhost:3000/api/inverter");
  const json = await response.json();

  const inv = json.data;

  const solarPower = Number(inv.total_ac_power) * 1000;
  const loadPower = 0; // We don't have household load yet

  return {
    timestamp: inv.timestamp,
    solarPower,
    loadPower,
    gridPower: 0, // We don't know import/export yet
    plantStatus: inv.inverter_status === 1 ? "producing" : "standby",
  };
}

export async function fetchEnergyTotals(): Promise<EnergyTotals> {
  const [inv, month, year] = await Promise.all([
    fetch("http://localhost:3000/api/inverter").then(r => r.json()),
    fetch("http://localhost:3000/api/charts/monthly").then(r => r.json()),
    fetch("http://localhost:3000/api/charts/yearly").then(r => r.json()),
  ]);

  const inverter = inv.data;

  return {
    today: Number(inverter.daily_production),

    month: month.results.reduce(
      (sum: number, x: any) => sum + Number(x.PvProduction),
      0
    ),

    year: year.results.reduce(
      (sum: number, x: any) => sum + Number(x.PvProduction),
      0
    ),

    total: Number(inverter.daily_energy_produced),

    todayPrevious: 0,
    monthPrevious: 0,
    yearPrevious: 0,
  };
}

export async function fetchPlantInfo(): Promise<PlantInfo> {
  const response = await fetch("http://localhost:3000/api/plant-config");
  const config = await response.json();

  return {
    id: 105717,
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
  const response = await fetch("http://localhost:3000/api/inverter");
  const json = await response.json();

  const inv = json.data;

  const dcPower = Number(inv.dc_power_1);
  const acPower = Number(inv.total_ac_power);

  return {
    model: inv.inverter_type_description,
    serial: inv.sno,
    firmware: inv.control_software_version ?? "Unknown",
    status: inv.inverter_status === 1 ? "online" : "offline",

    acVoltage: Number(inv.ac_voltage_a),
    acFrequency: Number(inv.ac_output_frequency),

    dcVoltage: Number(inv.dc_voltage_1),
    dcCurrent: Number(inv.dc_current_1),

    temperatureC: Number(inv.temperature_1),

    efficiencyPct:
      dcPower > 0 ? Math.round((acPower / dcPower) * 1000) / 10 : 0,
  };
}

export async function fetchLogger(): Promise<LoggerInfo> {
  const response = await fetch("http://localhost:3000/api/inverter");
  const json = await response.json();

  const inv = json.data;

  return {
    model: "UTL WiFi Logger",
    serial: inv.module_mac_address,
    firmware: inv.comm_software_version_1 ?? "Unknown",

    status: inv.logger_status === "1" ? "online" : "offline",

    wifiSsid: inv.router_ssid,

    rssiDbm: inv.signal_strength,

    lastCommunication: inv.timestamp,
  };
}

export async function fetchEnergySeries(
  range: EnergyRange
): Promise<SeriesPoint[]> {

  if (range === "day") {

    const data = await fetch(
      "http://localhost:3000/api/charts/daily"
    ).then(r => r.json());

    return data.results.map((p: any) => {

      const hour = Math.floor(p.timeMinutes / 60);
      const minute = p.timeMinutes % 60;

      return {
        label:
          String(hour).padStart(2, "0") +
          ":" +
          String(minute).padStart(2, "0"),

        value: p.PvProduction / 1000,

        compare: 0,
      };

    });

  }

  if (range === "month") {

    const data = await fetch(
      "http://localhost:3000/api/charts/monthly"
    ).then(r => r.json());

    return data.results.map((p: any) => ({

      label: String(p.date),

      value: p.PvProduction,

      compare: 0,

    }));

  }

  if (range === "year") {

    const data = await fetch(
      "http://localhost:3000/api/charts/yearly"
    ).then(r => r.json());

    return data.results.map((p: any) => ({

      label: String(p.month),

      value: p.PvProduction,

      compare: 0,

    }));

  }

  const data = await fetch(
    "http://localhost:3000/api/charts/total"
  ).then(r => r.json());

  return data.results.map((p: any) => ({

    label: String(p.year),

    value: p.PvProduction,

    compare: 0,

  }));

}


export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  return {
    bestDay: { date: "2026-04-11", generation: 24.86 },
    worstDay: { date: "2026-01-23", generation: 3.12 },
    averageDaily: 15.4,
    specificYield: 4.33,
    performanceRatio: 81.6,
    monthOverMonthPct: -5.5,
  };
}

export async function fetchHeatmap(): Promise<Cell[]> {
  const cells: HeatmapCell[] = [];
  MONTHS.forEach((month, mi) => {
    for (let day = 1; day <= 31; day++) {
      cells.push({
        month,
        day,
        value: Math.round(seeded(mi * 40 + day) * 18 * (0.6 + seeded(mi) * 0.7) * 10) / 10,
      });
    }
  });
  return cells;
}

export async function fetchDailyHistory(): Promise<DailyHistoryRow[]> {
  const conditions = ["Clear", "Partly cloudy", "Hazy", "Cloudy", "Light rain"];
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const gen = Math.round((8 + seeded(i + 2) * 15) * 100) / 100;
    return {
      date: d.toISOString().slice(0, 10),
      generation: gen,
      peakPower: Math.round(CAPACITY_W * (0.6 + seeded(i + 13) * 0.35)),
      sunHours: Math.round((4 + seeded(i + 31) * 5) * 10) / 10,
      weather: conditions[Math.floor(seeded(i + 6) * conditions.length)]!,
    };
  });
}

export async function fetchMonthlyHistory(): Promise<MonthlyHistoryRow[]> {
  return MONTHS.map((m, i) => {
    const gen = Math.round(240 + seeded(i + 5) * 260);
    return {
      month: `${m} 2026`,
      generation: gen,
      bestDay: Math.round((gen / 30) * 1.6 * 10) / 10,
      averageDaily: Math.round((gen / 30) * 10) / 10,
    };
  });
}

export async function fetchYearlyHistory(): Promise<YearlyHistoryRow[]> {
  return ["2023", "2024", "2025", "2026"].map((y, i) => {
    const gen = Math.round(2900 + seeded(i + 9) * 1400);
    return {
      year: y,
      generation: gen,
      averageDaily: Math.round((gen / 365) * 100) / 100,
      performanceRatio: Math.round((78 + seeded(i + 17) * 8) * 10) / 10,
    };
  });
}

export async function fetchWeatherNow(): Promise<WeatherNow> {
  return {
    condition: "Partly cloudy",
    temperatureC: 33.2,
    feelsLikeC: 35.1,
    humidityPct: 46,
    windKph: 12.4,
    windDirection: "WSW",
    cloudCoverPct: 34,
    irradianceWm2: 742,
    rainProbabilityPct: 12,
    uvIndex: 8.1,
    sunrise: "05:58",
    sunset: "19:16",
  };
}

export async function fetchWeatherForecast(): Promise<WeatherForecastDay[]> {
  const days = ["Today", "Tomorrow", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const conditions = ["Sunny", "Partly cloudy", "Cloudy", "Light rain", "Hazy sun"];
  return days.map((day, i) => ({
    day,
    condition: conditions[Math.floor(seeded(i + 4) * conditions.length)]!,
    highC: Math.round(30 + seeded(i + 8) * 8),
    lowC: Math.round(21 + seeded(i + 12) * 5),
    cloudCoverPct: Math.round(seeded(i + 15) * 80),
    rainProbabilityPct: Math.round(seeded(i + 19) * 60),
    expectedKwh: Math.round((11 + seeded(i + 23) * 12) * 10) / 10,
  }));
}

export async function fetchMaintenance(): Promise<MaintenanceState> {
  return {
    installationDate: plantInfo.installationDate,
    lastCleaning: "2026-07-08",
    lastInspection: "2026-05-19",
    healthScore: 87,
    healthFactors: [
      { label: "Weather-adjusted production", score: 91, weightPct: 35 },
      { label: "Maintenance history", score: 84, weightPct: 25 },
      { label: "Plant age & degradation", score: 88, weightPct: 20 },
      { label: "Data availability", score: 79, weightPct: 20 },
    ],
    timeline: [
      {
        id: "m6",
        date: "2026-07-08",
        type: "cleaning",
        title: "Panel cleaning",
        note: "All 12 modules rinsed and wiped. Dust film noted on the east row.",
      },
      {
        id: "m5",
        date: "2026-05-19",
        type: "inspection",
        title: "Annual inspection",
        note: "DC connectors, earthing and mounting torque checked — no issues.",
      },
      {
        id: "m4",
        date: "2026-02-02",
        type: "cleaning",
        title: "Panel cleaning",
        note: "Post-winter dust removal.",
      },
      {
        id: "m3",
        date: "2025-11-11",
        type: "repair",
        title: "Logger replaced",
        note: "WiFi stick swapped after repeated dropouts.",
      },
      {
        id: "m2",
        date: "2025-04-06",
        type: "inspection",
        title: "Routine inspection",
        note: "Inverter fan cleaned, firmware updated.",
      },
      {
        id: "m1",
        date: "2023-03-14",
        type: "installation",
        title: "System commissioned",
        note: "4.305 kW on-grid system commissioned and grid-synced.",
      },
    ],
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
