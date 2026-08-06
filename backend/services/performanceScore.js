function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreGeneration(actual, expected) {
  if (expected <= 0) return 100;

  return clamp((actual / expected) * 100, 0, 100);
}

function scoreWeather(weatherFactor) {
  return clamp(weatherFactor * 100, 60, 100);
}

function scoreSeason(today, monthlyAverage) {
  if (monthlyAverage <= 0) return 100;

  return clamp((today / monthlyAverage) * 100, 60, 100);
}

function scoreGeometry() {
  // South + 35° = almost ideal
  return 98;
}

function scoreMaintenance(daysWithoutRain) {
  if (daysWithoutRain <= 3) return 100;
  if (daysWithoutRain <= 7) return 96;
  if (daysWithoutRain <= 14) return 92;
  if (daysWithoutRain <= 21) return 88;

  return 82;
}

function scoreData(loggerOnline) {
  return loggerOnline ? 100 : 70;
}

function buildPerformanceScore({
  currentEnergy,
  expectedToday,
  monthAverage,
  weatherFactor,
  loggerOnline,
  daysWithoutRain,
}) {

  const generation = scoreGeneration(currentEnergy, expectedToday);

  const weather = scoreWeather(weatherFactor);

  const seasonal = scoreSeason(currentEnergy, monthAverage);

  const geometry = scoreGeometry();

  const maintenance = scoreMaintenance(daysWithoutRain);

  const data = scoreData(loggerOnline);

  const total =
      generation * 0.40 +
      weather * 0.20 +
      seasonal * 0.15 +
      geometry * 0.10 +
      maintenance * 0.10 +
      data * 0.05;

  let status = "Excellent";

  if (total < 60) status = "Critical";
  else if (total < 75) status = "Fair";
  else if (total < 90) status = "Good";

  return {
      score: Math.round(total),
      status,

      breakdown: {
          generation,
          weather,
          seasonal,
          geometry,
          maintenance,
          data,
      },
  };
}

module.exports = {
    buildPerformanceScore,
};