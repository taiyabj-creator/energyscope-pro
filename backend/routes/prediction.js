const express = require("express");
const router = express.Router();

const {
  getExportData,
  getLast30DaysGeneration,
} = require("../services/exportService");
const { predictDailyEnergy } = require("../services/predictionService");
const { getWeather } = require("../services/weatherService");
const { buildPerformanceScore } = require("../services/performanceScore");


router.get("/today", async (req, res) => {
  try {
    const now = new Date();

    const month =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const year = String(now.getFullYear());

    const data = await getExportData(
  req.token,
  req.session,
  month,
  year
);
    console.log(
      "Monthly response:",
      JSON.stringify(data.monthly, null, 2)
      );

    

    const currentEnergy =
      data.monthly.results.find(r => r.date === now.getDate())?.PvProduction ?? 0;

    const monthly = data.monthly.results ?? [];

    const monthAverage =
      monthly.length > 0
        ? monthly.reduce((sum, r) => sum + r.PvProduction, 0) / monthly.length
        : 0;

    const weather = await getWeather(22.5736, 88.3639);

const sunrise = new Date(weather.sunrise);
const sunset = new Date(weather.sunset);

const sunriseHour =
  sunrise.getHours() + sunrise.getMinutes() / 60;

const sunsetHour =
  sunset.getHours() + sunset.getMinutes() / 60;

const prediction = predictDailyEnergy({
  currentEnergy,
  monthAverage,

  cloudCover: weather.cloudCover,
  rainProbability: weather.rainProbability,
  weatherCode: weather.weatherCode,
  uvIndex: weather.uvIndex,
});
const performance = buildPerformanceScore({
  currentEnergy,
  expectedToday: prediction.expectedToday,
  monthAverage,
  weatherFactor: prediction.weatherFactor,
  loggerOnline: true,
  daysWithoutRain: weather.rainProbability > 70 ? 0 : 5,
});

const history = await getLast30DaysGeneration(
  req.token,
  req.session,
  now
);

const comparisonValue =
  now.getHours() < sunsetHour
    ? prediction.expectedToday
    : currentEnergy;

const ranked = [...history, { generation: comparisonValue }]
  .sort((a, b) => b.generation - a.generation);

const position =
  ranked.findIndex((d) => d.generation === comparisonValue) + 1;

const rank = {
  position,
  totalDays: history.length + 1,
  label: `#${position}`,
  subtitle: "Compared with the past 30 days",
};

    res.json({
  success: true,
  ...prediction,
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