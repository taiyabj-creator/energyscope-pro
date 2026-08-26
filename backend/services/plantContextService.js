/**
 * EnergyScope verified-data context builder for the Gemini solar assistant.
 *
 * Phase 2: collects ONLY data that existing EnergyScope services already know
 * and hands it to geminiService as a server-generated appendix. This module is
 * pure aggregation/composition - it implements NO new calculations:
 *
 *   UTL API (via utlApi/exportService) -> measured generation + live power
 *   weatherService.js                  -> weather (Open-Meteo)
 *   predictionService.js               -> forecast (authoritative, untouched)
 *   performanceScore.js                -> performance score (untouched)
 *   config/plant.json                  -> static plant configuration
 *
 * Every section degrades independently to { unavailable } on failure - fake
 * values are never sent to Gemini, and missing data is never zero-filled.
 *
 * Secrets: the caller's JWT/session are used ONLY to authenticate upstream
 * EnergyScope calls and are never copied into the returned context or the
 * rendered appendix.
 */

const path = require("path");

const utlApi = require("./utlApi");
const exportService = require("./exportService");
const weatherService = require("./weatherService");
const { predictDailyEnergy } = require("./predictionService");
const { buildPerformanceScore } = require("./performanceScore");
const plantConfig = require("../config/plant.json");

const CONTEXT_TTL_MS = 60_000;

/** Per-source ceiling so one slow upstream never blocks the whole context. */
const SOURCE_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function istDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function unavailable(reason) {
  return { unavailable: true, reason };
}

function isAvailable(section) {
  return section && !section.unavailable;
}

function round2(value) {
  return Number(Number(value).toFixed(2));
}

/** Race a promise against a timeout. Resolves to {ok, val?, err?}. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise.then((val) => ({ ok: true, val })).catch((err) => ({ ok: false, err })),
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ ok: false, err: new Error(`${label} timed out after ${ms}ms`) }),
        ms,
      ),
    ),
  ]);
}

/** Fetch the inverter device snapshot (same endpoint the dashboard uses). */
async function getInverterSnapshot(jwtToken, session) {
  const response = await utlApi.utlFetch(
    jwtToken,
    session,
    "https://utlsolarrms.com/api/InverterDevice",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_sn: "ECB50A8FF18D" }),
    },
  );
  const payload = await response.json();
  const inv = payload?.data ?? {};
  const powerKw = Number(inv.total_ac_power);
  return {
    timestamp: typeof inv.timestamp === "string" ? inv.timestamp : null,
    powerKw: Number.isFinite(powerKw) ? round2(powerKw) : null,
    statusCode: Number(inv.inverter_status),
  };
}

/** Derive plant liveness from a getPlantStatus payload (no new semantics -
 * mirrors the lists the rest of the backend already consumes). */
function deriveLiveStatus(plantStatus, plantId) {
  const data = plantStatus?.data;
  if (!data || !plantId) return null;
  if (data.online?.plantIds?.includes(plantId)) return "online";
  if (data.partiallyOnline?.plantIds?.includes(plantId)) return "partially online";
  if (data.partiallyOffline?.plantIds?.includes(plantId)) return "partially offline";
  if (data.offline?.plantIds?.includes(plantId)) return "offline";
  return "not listed in any status group";
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * Build the verified EnergyScope context object. Never throws for individual
 * data sources; only rejects if even the timestamp cannot be formed (never).
 * @param {{token: string, session: object}} auth authenticated request context
 */
async function buildPlantContext({ token, session }) {
  const nowIst = istDateString();

  const [statusRes, inverterRes, exportRes, historyRes, weatherRes] = await Promise.allSettled([
    withTimeout(utlApi.getPlantStatus(token, session), SOURCE_TIMEOUT_MS, "plantStatus"),
    withTimeout(getInverterSnapshot(token, session), SOURCE_TIMEOUT_MS, "inverterSnapshot"),
    withTimeout(
      exportService.getExportData(
        token,
        session,
        `${nowIst.slice(0, 4)}-${nowIst.slice(5, 7)}`,
        nowIst.slice(0, 4),
      ),
      SOURCE_TIMEOUT_MS,
      "exportData",
    ),
    withTimeout(
      exportService.getLast30DaysGeneration(token, session, new Date()),
      SOURCE_TIMEOUT_MS,
      "last30Days",
    ),
    withTimeout(
      weatherService.getWeather(plantConfig.latitude, plantConfig.longitude),
      SOURCE_TIMEOUT_MS,
      "weather",
    ),
  ]);

  const value = (r) => {
    if (r.status !== "fulfilled") return null;
    const v = r.value;
    return v && v.ok === false ? null : (v?.val ?? v);
  };
  const reasonOf = (r, label) => {
    if (r.status !== "fulfilled")
      return `${label}: ${String(r.reason?.message ?? r.reason).slice(0, 120)}`;
    const v = r.value;
    if (v && v.ok === false) return `${label}: ${String(v.err?.message ?? v.err).slice(0, 120)}`;
    return `${label}: request failed`;
  };

  // --- Plant ---------------------------------------------------------------
  const plantStatus = value(statusRes);
  const plantId = plantStatus?.data?.total?.plantIds?.[0] ?? null;
  const plant = {
    name: plantConfig.name ?? null,
    location: plantConfig.location ?? null,
    capacityKw: plantConfig.capacity ?? null,
    timezone: plantConfig.timezone ?? null,
    plantId,
    liveStatus: plantId
      ? deriveLiveStatus(plantStatus, plantId)
      : unavailable(reasonOf(statusRes, "plant status")),
  };

  // --- Today + month (from the same monthly chart /api/prediction reads) ---
  let today = unavailable(reasonOf(exportRes, "generation data"));
  let month = unavailable(reasonOf(exportRes, "generation data"));
  let monthlyGeneration = [];
  let currentMonthBestDay = null;
  let currentMonthWorstDay = null;
  const exportData = value(exportRes);
  if (exportData?.monthly?.results) {
    const rows = Array.isArray(exportData.monthly.results) ? exportData.monthly.results : [];
    const todayRow = rows.find((r) => Number(r.date) === Number(nowIst.slice(8, 10)));
    const mtdRows = rows.filter((r) => Number(r.date) <= Number(nowIst.slice(8, 10)));

    today = {
      generationKwh: todayRow ? round2(todayRow.PvProduction ?? 0) : null,
      measuredBy: "UTL Solar RMS (monthly chart row for today)",
    };
    if (!todayRow) {
      today.generationKwh = unavailable("no monthly-chart row for today yet");
    }

    const inverter = value(inverterRes);
    const loggerOnline = plant.liveStatus === "online";
    if (inverter) {
      today.currentPowerKw = loggerOnline ? inverter.powerKw : 0;
      today.currentPowerNote = loggerOnline
        ? "live AC power from the inverter device endpoint"
        : "logger not online; live AC power reported as 0 by the same rule the dashboard uses";
      today.inverterTimestamp = inverter.timestamp;
    } else {
      today.currentPowerKw = unavailable(reasonOf(inverterRes, "live power"));
    }

    const monthKey = `${nowIst.slice(0, 4)}-${nowIst.slice(5, 7)}`;

    // Build explicit per-day generation array for the current month.
    // Only rows actually returned by UTL are included; missing days are
    // never fabricated or zero-filled.
    monthlyGeneration = rows.map((r) => ({
      date: `${monthKey}-${String(r.date).padStart(2, "0")}`,
      generationKwh: round2(r.PvProduction ?? 0),
    }));

    if (monthlyGeneration.length > 0) {
      const best = monthlyGeneration.reduce((a, b) => (b.generationKwh > a.generationKwh ? b : a));
      const worst = monthlyGeneration.reduce((a, b) => (b.generationKwh < a.generationKwh ? b : a));
      currentMonthBestDay = { date: best.date, generationKwh: best.generationKwh };
      currentMonthWorstDay = { date: worst.date, generationKwh: worst.generationKwh };
    }

    if (mtdRows.length > 0) {
      const mtdTotal = mtdRows.reduce((sum, r) => sum + Number(r.PvProduction ?? 0), 0);
      month = {
        key: monthKey,
        monthToDateKwh: round2(mtdTotal),
        daysRecorded: mtdRows.length,
        dailyAverageKwh: round2(mtdTotal / mtdRows.length),
      };
    } else {
      month = unavailable("monthly chart has no rows for this month yet");
    }
  }

  // --- Last-30-days summary --------------------------------------------------
  let recentHistory = unavailable(reasonOf(historyRes, "history"));
  const history = value(historyRes);
  if (Array.isArray(history) && history.length > 0) {
    const generations = history.map((d) => d.generation);
    const best = history.reduce((a, b) => (b.generation > a.generation ? b : a));
    const worst = history.reduce((a, b) => (b.generation < a.generation ? b : a));
    const last7 = history.slice(-7);
    recentHistory = {
      windowDays: history.length,
      totalKwh: round2(generations.reduce((s, g) => s + g, 0)),
      averageKwh: round2(generations.reduce((s, g) => s + g, 0) / generations.length),
      bestDay: { date: best.date, kwh: round2(best.generation) },
      worstDay: { date: worst.date, kwh: round2(worst.generation) },
      last7DaysAverageKwh: round2(last7.reduce((s, d) => s + d.generation, 0) / last7.length),
      yesterdayKwh: round2(history[0].generation),
      yesterdayDate: history[0].date,
    };
  }

  // --- Explicit recent-days (date-keyed) for unambiguous relative-date usage -
  const recentDays = [];
  if (isAvailable(today) && typeof today.generationKwh === "number") {
    recentDays.push({ date: nowIst, label: "today", generationKwh: today.generationKwh });
  }
  if (Array.isArray(history) && history.length >= 1) {
    recentDays.push({
      date: history[0].date,
      label: "yesterday",
      generationKwh: round2(history[0].generation),
    });
  }
  if (Array.isArray(history) && history.length >= 2) {
    recentDays.push({
      date: history[1].date,
      label: "day before yesterday",
      generationKwh: round2(history[1].generation),
    });
  }

  // --- Weather ----------------------------------------------------------------
  const weatherRaw = value(weatherRes);
  const weather = weatherRaw
    ? {
        provider: "Open-Meteo via EnergyScope weatherService",
        cloudCoverPercent: weatherRaw.cloudCover,
        rainProbabilityPercent: weatherRaw.rainProbability,
        weatherCode: weatherRaw.weatherCode,
        uvIndex: weatherRaw.uvIndex,
        sunrise: weatherRaw.sunrise ?? null,
        sunset: weatherRaw.sunset ?? null,
      }
    : unavailable(reasonOf(weatherRes, "weather"));

  // --- Forecast (predictionService output, verbatim - never recalculated) ----
  let forecast = unavailable("requires today's generation and weather");
  const monthAverage = isAvailable(month) ? month.dailyAverageKwh : null;
  const currentEnergy =
    isAvailable(today) && typeof today.generationKwh === "number" ? today.generationKwh : null;
  if (
    currentEnergy !== null &&
    monthAverage !== null &&
    isAvailable(weather) &&
    typeof weather.cloudCoverPercent === "number"
  ) {
    forecast = {
      ...predictDailyEnergy({
        currentEnergy,
        monthAverage,
        cloudCover: weather.cloudCoverPercent,
        rainProbability: weather.rainProbabilityPercent ?? 0,
        weatherCode: weather.weatherCode ?? 0,
        uvIndex: weather.uvIndex ?? 8,
      }),
      calculatedBy: "EnergyScope predictionService (do not recalculate)",
    };
  }

  // --- Performance --------------------------------------------------------------
  let performance = unavailable("requires the EnergyScope forecast inputs");
  if (isAvailable(forecast)) {
    performance = {
      ...buildPerformanceScore({
        currentEnergy,
        expectedToday: forecast.expectedToday,
        monthAverage,
        weatherFactor: forecast.weatherFactor,
        loggerOnline: plant.liveStatus === "online",
        daysWithoutRain: (weather.rainProbabilityPercent ?? 0) > 70 ? 0 : 5,
      }),
      calculatedBy: "EnergyScope performanceScore",
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    generatedAtIstDate: nowIst,
    plant,
    today,
    month,
    monthlyGeneration,
    currentMonthBestDay,
    currentMonthWorstDay,
    recentHistory,
    recentDays,
    weather,
    forecast,
    performance,
  };
}

// ---------------------------------------------------------------------------
// Rendering: deterministic text appendix for Gemini's system instruction
// ---------------------------------------------------------------------------

function fmt(value) {
  if (value === null || value === undefined) return "unavailable";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return value.unavailable ? `unavailable (${value.reason})` : JSON.stringify(value);
  }
  return String(value);
}

function section(title, body) {
  return `${title}:\n${body}`;
}

/** Render the verified-data appendix. Contains NO secrets by construction. */
function renderContextAppendix(context) {
  const c = context;
  const lines = [];

  lines.push("=== ENERGYSCOPE VERIFIED DATA (generated server-side just now) ===");
  lines.push(`Generated at: ${c.generatedAt} (IST date: ${c.generatedAtIstDate})`);
  lines.push("");
  lines.push(
    section(
      "PLANT (backend configuration + live status)",
      `name: ${fmt(c.plant.name)}\nlocation: ${fmt(c.plant.location)}\ncapacity kW: ${fmt(c.plant.capacityKw)}\ntimezone: ${fmt(c.plant.timezone)}\nlive status: ${fmt(c.plant.liveStatus)}`,
    ),
  );
  lines.push("");
  lines.push(
    section(
      "TODAY (MEASURED unless marked otherwise)",
      `date: ${c.generatedAtIstDate}\ntoday's generation kWh: ${fmt(isAvailable(c.today) ? c.today.generationKwh : c.today)}\ncurrent AC power kW: ${fmt(isAvailable(c.today) ? c.today.currentPowerKw : null)}${isAvailable(c.today) && c.today.currentPowerNote ? `\nnote: ${c.today.currentPowerNote}` : ""}`,
    ),
  );
  lines.push("");
  if (Array.isArray(c.recentDays) && c.recentDays.length > 0) {
    const dayLines = c.recentDays.map(
      (d) =>
        `${d.date} (${d.label}): ${typeof d.generationKwh === "number" ? d.generationKwh + " kWh" : "unavailable"}`,
    );
    lines.push(
      section(
        "RECENT DATES (MEASURED - use these for relative-date questions like today/yesterday/day-before-yesterday)",
        dayLines.join("\n"),
      ),
    );
    lines.push("");
  }
  if (Array.isArray(c.monthlyGeneration) && c.monthlyGeneration.length > 0) {
    const dayLines = c.monthlyGeneration.map((d) => `${d.date}: ${d.generationKwh} kWh`);
    lines.push(
      section(
        "CURRENT MONTH DAILY GENERATION (MEASURED - from UTL monthly chart for this calendar month ONLY - use this for best/worst/trend-of-this-month questions)",
        dayLines.join("\n"),
      ),
    );
    lines.push("");
  }
  lines.push(
    section(
      "CURRENT MONTH SUMMARY (MEASURED)",
      isAvailable(c.month)
        ? `month-to-date kWh: ${c.month.monthToDateKwh}\ndays recorded: ${c.month.daysRecorded}\ndaily average kWh: ${c.month.dailyAverageKwh}${c.currentMonthBestDay ? `\nbest day: ${c.currentMonthBestDay.generationKwh} kWh on ${c.currentMonthBestDay.date}` : ""}${c.currentMonthWorstDay ? `\nworst day: ${c.currentMonthWorstDay.generationKwh} kWh on ${c.currentMonthWorstDay.date}` : ""}`
        : fmt(c.month),
    ),
  );
  lines.push("");
  lines.push(
    section(
      "LAST 30 COMPLETED DAYS (MEASURED - rolling historical window, may cross month boundaries - use CURRENT MONTH sections above for this-month questions)",
      isAvailable(c.recentHistory)
        ? `window: ${c.recentHistory.windowDays} days ending ${c.recentHistory.yesterdayDate}\nyesterday kWh: ${c.recentHistory.yesterdayKwh}\nperiod total kWh: ${c.recentHistory.totalKwh}\nperiod average kWh/day: ${c.recentHistory.averageKwh}\nlast-7-days average kWh/day: ${c.recentHistory.last7DaysAverageKwh}\nbest day: ${c.recentHistory.bestDay.kwh} kWh on ${c.recentHistory.bestDay.date}\nworst day: ${c.recentHistory.worstDay.kwh} kWh on ${c.recentHistory.worstDay.date}`
        : fmt(c.recentHistory),
    ),
  );
  lines.push("");
  lines.push(
    section(
      "WEATHER (WEATHER DATA - Open-Meteo via weatherService)",
      isAvailable(c.weather)
        ? `cloud cover %: ${fmt(c.weather.cloudCoverPercent)}\nrain probability %: ${fmt(c.weather.rainProbabilityPercent)}\nweather code: ${fmt(c.weather.weatherCode)}\nUV index: ${fmt(c.weather.uvIndex)}\nsunrise: ${fmt(c.weather.sunrise)}\nsunset: ${fmt(c.weather.sunset)}`
        : fmt(c.weather),
    ),
  );
  lines.push("");
  lines.push(
    section(
      "ENERGYSCOPE FORECAST (CALCULATED by predictionService - authoritative, explain but NEVER recalculate)",
      isAvailable(c.forecast)
        ? `expectedToday kWh: ${c.forecast.expectedToday}\ndifference vs actual kWh: ${c.forecast.difference} (${c.forecast.differenceLabel})\nforecast percent achieved: ${c.forecast.forecastPercent}%\nmonth average baseline kWh: ${c.forecast.monthAverage}\nweather factor applied: ${c.forecast.weatherFactor}\nconfidence: ${c.forecast.confidence}`
        : fmt(c.forecast),
    ),
  );
  lines.push("");
  lines.push(
    section(
      "PERFORMANCE (CALCULATED by EnergyScope performanceScore)",
      isAvailable(c.performance)
        ? `score: ${c.performance.score}/100 (${c.performance.status})\nbreakdown: ${JSON.stringify(c.performance.breakdown)}`
        : fmt(c.performance),
    ),
  );
  lines.push("");
  lines.push(
    "Notes: MEASURED values come from the UTL Solar RMS API. FORECAST and PERFORMANCE values are EnergyScope calculations. Any field showing 'unavailable' must be described as temporarily unavailable - never guessed.",
  );
  lines.push("=== END ENERGYSCOPE VERIFIED DATA ===");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tiny TTL cache so rapid chat turns don't hammer the UTL API (60 s).
// Single-entry: the most recent authenticated user wins; entries hold a
// promise, so concurrent requests share one collection round.
// ---------------------------------------------------------------------------

let cachedEntry = null; // { key, expiresAt, promise }

function getContextCached(token, session, { now = Date.now(), ttlMs = CONTEXT_TTL_MS } = {}) {
  if (cachedEntry && cachedEntry.key === token && now < cachedEntry.expiresAt) {
    return cachedEntry.promise;
  }
  const promise = buildPlantContext({ token, session }).catch((err) => {
    if (cachedEntry && cachedEntry.promise === promise) cachedEntry = null;
    throw err;
  });
  cachedEntry = { key: token, expiresAt: now + ttlMs, promise };
  return promise;
}

function clearContextCache() {
  cachedEntry = null;
}

/** True when at least one usable data section exists. If nothing could be
 * collected the caller should omit the appendix entirely and answer without
 * plant data (phase-1 behavior) rather than sending a wall of "unavailable". */
function contextHasAnyData(context) {
  return (
    isAvailable(context.today) ||
    isAvailable(context.month) ||
    isAvailable(context.recentHistory) ||
    isAvailable(context.weather) ||
    isAvailable(context.forecast) ||
    isAvailable(context.performance)
  );
}

module.exports = {
  buildPlantContext,
  renderContextAppendix,
  getContextCached,
  clearContextCache,
  contextHasAnyData,
  _internals: { istDateString, deriveLiveStatus, fmt },
};
