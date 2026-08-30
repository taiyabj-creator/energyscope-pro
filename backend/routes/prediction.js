const express = require("express");
const router = express.Router();

const { getExportData, getLast30DaysGeneration } = require("../services/exportService");
const { predictForDate } = require("../services/predictionService");
const { getWeather } = require("../services/weatherService");
const { buildPerformanceScore } = require("../services/performanceScore");
const archiveService = require("../services/archiveService");
const plantConfig = require("../config/plant.json");

router.get("/today", async (req, res) => {
  try {
    const now = new Date();

    // Use IST calendar date for "today" and the month, matching the AI
    // context builder (plantContextService) so the dashboard and assistant
    // compute the identical base prediction and today's row.
    const nowIst = archiveService.istDateString(now);
    const nowIstDate = Number(nowIst.slice(8, 10));

    const month = nowIst.slice(0, 7);

    const year = nowIst.slice(0, 4);

    const data = await getExportData(req.token, req.session, month, year);
    console.log("Monthly response:", JSON.stringify(data.monthly, null, 2));

    // Round today's generation to 2 decimals, matching plantContextService so
    // the dashboard and AI feed predictDailyEnergy the identical currentEnergy.
    const currentEnergy =
      Math.round(
        (Number(
          data.monthly.results.find((r) => Number(r.date) === nowIstDate)?.PvProduction ?? 0,
        ) +
          Number.EPSILON) *
          100,
      ) / 100;

    const monthly = data.monthly.results ?? [];

    // Month-to-date average over COMPLETED days only (date < today), matching
    // plantContextService (AI context) so the dashboard and AI always compute
    // the identical base prediction. Today's partial generation is excluded
    // from the baseline: it must not drag today's forecast toward itself.
    const mtdRows = monthly.filter((r) => Number(r.date) < nowIstDate);
    const monthAverage =
      mtdRows.length > 0 ? mtdRows.reduce((sum, r) => sum + r.PvProduction, 0) / mtdRows.length : 0;

    const weather = await getWeather(plantConfig.latitude, plantConfig.longitude);

    // Full smart prediction for today (IST). predictForDate computes the
    // current-weather base prediction and then applies the historical residual
    // correction using ONLY completed history strictly before today, so today's
    // partial generation / live weather snapshot can never leak into its own
    // forecast.
    const corrected = predictForDate({
      targetDate: nowIst,
      currentEnergy,
      monthAverage,
      cloudCover: weather.cloudCover,
      rainProbability: weather.rainProbability,
      weatherCode: weather.weatherCode,
      uvIndex: weather.uvIndex,
    });

    const performance = buildPerformanceScore({
      currentEnergy,
      expectedToday: corrected.expectedToday,
      monthAverage,
      weatherFactor: corrected.weatherFactor,
      loggerOnline: true,
      daysWithoutRain: weather.rainProbability > 70 ? 0 : 5,
    });

    const history = await getLast30DaysGeneration(req.token, req.session, now);

    const comparisonValue = currentEnergy;

    const ranked = [...history, { generation: comparisonValue }].sort(
      (a, b) => b.generation - a.generation,
    );

    const position = ranked.findIndex((d) => d.generation === comparisonValue) + 1;

    const rank = {
      position,
      totalDays: history.length + 1,
      label: `#${position}`,
      subtitle: "Compared with the past 30 days",
    };

    res.json({
      success: true,
      ...corrected,
      performance,
      rank,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
