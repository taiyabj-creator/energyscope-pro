function predictDailyEnergy({
  currentEnergy,
  monthAverage,

  cloudCover = 0,
  rainProbability = 0,
  weatherCode = 0,
  uvIndex = 8,
}) {
  let weatherFactor = 1;

  // Cloud cover penalty
  if (cloudCover >= 80) weatherFactor -= 0.20;
  else if (cloudCover >= 60) weatherFactor -= 0.12;
  else if (cloudCover >= 40) weatherFactor -= 0.07;
  else if (cloudCover >= 20) weatherFactor -= 0.03;

  // Rain probability penalty
  if (rainProbability >= 90) weatherFactor -= 0.12;
  else if (rainProbability >= 70) weatherFactor -= 0.08;
  else if (rainProbability >= 50) weatherFactor -= 0.04;

  // Weather type
  if (weatherCode === 3) weatherFactor -= 0.08;
  else if ([61,63,65,80,81,82].includes(weatherCode))
    weatherFactor -= 0.15;
  else if ([95,96,99].includes(weatherCode))
    weatherFactor -= 0.22;

  // UV adjustment
  if (uvIndex >= 9) weatherFactor += 0.03;
  else if (uvIndex < 3) weatherFactor -= 0.05;

  weatherFactor = Math.max(0.60, Math.min(1.05, weatherFactor));

  // Daily forecast (fixed for the day)
  const expectedToday = Number(
    (monthAverage * weatherFactor).toFixed(2)
  );

  const difference = Number(
    (currentEnergy - expectedToday).toFixed(2)
  );

  const forecastPercent = Number(
    ((currentEnergy / expectedToday) * 100).toFixed(1)
  );

  let confidence = "High";
  if (weatherFactor < 0.70) confidence = "Low";
  else if (weatherFactor < 0.90) confidence = "Medium";

  return {
    currentEnergy,

    expectedToday,

    difference,

    differenceLabel:
      difference >= 0
        ? "Above forecast"
        : "Below forecast",

    forecastPercent,

    completion: forecastPercent,

    monthAverage,

    weatherFactor: Number(weatherFactor.toFixed(2)),

    confidence,
  };
}

module.exports = {
  predictDailyEnergy,
};