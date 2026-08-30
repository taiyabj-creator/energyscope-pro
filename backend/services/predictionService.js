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
  if (cloudCover >= 80) weatherFactor -= 0.2;
  else if (cloudCover >= 60) weatherFactor -= 0.12;
  else if (cloudCover >= 40) weatherFactor -= 0.07;
  else if (cloudCover >= 20) weatherFactor -= 0.03;

  // Rain probability penalty
  if (rainProbability >= 90) weatherFactor -= 0.12;
  else if (rainProbability >= 70) weatherFactor -= 0.08;
  else if (rainProbability >= 50) weatherFactor -= 0.04;

  // Weather type
  if (weatherCode === 3) weatherFactor -= 0.08;
  else if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) weatherFactor -= 0.15;
  else if ([95, 96, 99].includes(weatherCode)) weatherFactor -= 0.22;

  // UV adjustment
  if (uvIndex >= 9) weatherFactor += 0.03;
  else if (uvIndex < 3) weatherFactor -= 0.05;

  weatherFactor = Math.max(0.6, Math.min(1.05, weatherFactor));

  // Daily forecast (fixed for the day)
  const expectedToday = Number((monthAverage * weatherFactor).toFixed(2));

  const difference = Number((currentEnergy - expectedToday).toFixed(2));

  const forecastPercent = Number(((currentEnergy / expectedToday) * 100).toFixed(1));

  let confidence = "High";
  if (weatherFactor < 0.7) confidence = "Low";
  else if (weatherFactor < 0.9) confidence = "Medium";

  return {
    currentEnergy,

    expectedToday,

    difference,

    differenceLabel: difference >= 0 ? "Above forecast" : "Below forecast",

    forecastPercent,

    completion: forecastPercent,

    monthAverage,

    weatherFactor: Number(weatherFactor.toFixed(2)),

    confidence,
  };
}

/**
 * Applies a historical residual correction to the base prediction.
 *
 * @param {object} base - output of predictDailyEnergy()
 * @param {object} corrections - from archiveService.getCorrectionFactor()
 *   { correctionFactor, sampleSize, confidence, bucket }
 * @returns {object} - same shape as base, with corrected expectedToday
 *   and additional correction metadata fields.
 *
 * The correction is conservative: it never shifts the base prediction
 * by more than 30%, and is only applied when there are ≥5 historical
 * samples with matching weather.
 */
function applyCorrection(base, corrections) {
  const {
    correctionFactor = 0,
    sampleSize = 0,
    effectiveSample = null,
    confidence = "none",
  } = corrections || {};

  // Require enough WEIGHTED historical evidence. effectiveSample (sum of
  // similarity x recency weights) is the authoritative signal when the model
  // provides it; otherwise fall back to the raw sampleSize.
  const evidence =
    effectiveSample !== null && effectiveSample !== undefined ? effectiveSample : sampleSize;
  if (evidence < 1.5 || sampleSize < 5 || correctionFactor === 0) {
    return {
      ...base,
      corrected: false,
      correctionApplied: 0,
      correctionConfidence: "none",
    };
  }

  const adjusted = base.expectedToday * (1 + correctionFactor);
  const minAllowed = base.expectedToday * 0.7;
  const maxAllowed = base.expectedToday * 1.3;
  const clamped = Number(Math.max(minAllowed, Math.min(maxAllowed, adjusted)).toFixed(2));

  const difference = Number((base.currentEnergy - clamped).toFixed(2));
  const forecastPercent = Number(((base.currentEnergy / clamped) * 100).toFixed(1));

  return {
    ...base,
    expectedToday: clamped,
    difference,
    differenceLabel: difference >= 0 ? "Above forecast" : "Below forecast",
    forecastPercent,
    completion: forecastPercent,
    corrected: true,
    correctionApplied: correctionFactor,
    correctionConfidence: confidence,
    correctionSamples: sampleSize,
    correctionEffectiveSample: effectiveSample,
  };
}

/**
 * Predicts expected daily generation for an ARBITRARY target date from its
 * forecast/current weather, using only completed historical data strictly
 * BEFORE that date for the correction. Never uses the target day's own
 * generation/weather (archiveService enforces snapshot_date < targetDate).
 *
 * @param {object} p - { targetDate, currentEnergy, monthAverage,
 *                        cloudCover, rainProbability, weatherCode, uvIndex }
 * @returns {object} same shape as applyCorrection(base, ...) plus targetDate.
 */
function predictForDate(p = {}) {
  const {
    targetDate,
    currentEnergy = 0,
    monthAverage = 0,
    cloudCover = 0,
    rainProbability = 0,
    weatherCode = 0,
    uvIndex = 8,
  } = p;

  const archiveService = require("./archiveService");

  // Ask the archive for the correction FIRST. getCorrectionFactor now derives a
  // weather-normalized baseline B = mean(gen_r / WF_r) over completed history
  // strictly before targetDate (excluding today's partial and future rows). We
  // use that SAME B for the base below, so base (B * WF) and residual
  // (gen / (B * WF) - 1) share one consistent baseline (FIX B). If the archive
  // has insufficient data it returns baseline 0 and we fall back to the caller's
  // monthAverage, preserving graceful degradation.
  let corrections = null;
  let effectiveMonthAverage = monthAverage;
  let baseline = null;
  try {
    corrections = archiveService.getCorrectionFactor({
      cloudCover,
      rainProbability,
      weatherCode,
      uvIndex,
      targetDate,
    });
    const b = Number(corrections?.baseline);
    if (Number.isFinite(b) && b > 0) {
      effectiveMonthAverage = Number(b.toFixed(4));
      baseline = b;
    }
  } catch (_) {
    corrections = null;
  }

  // Base prediction: B * WF, where B is the weather-normalized historical
  // baseline (or the caller's monthAverage as a fallback). currentEnergy is
  // unchanged (it is an input/display value, never part of the learned model).
  const base = predictDailyEnergy({
    currentEnergy,
    monthAverage: effectiveMonthAverage,
    cloudCover,
    rainProbability,
    weatherCode,
    uvIndex,
  });

  let corrected = base;
  if (corrections) {
    corrected = applyCorrection(base, corrections);
    corrected.correctionBucket = corrections.bucket;
  }
  // Report the baseline actually used so the base is transparent.
  corrected.baseline = base.monthAverage;

  corrected.targetDate = targetDate;
  return corrected;
}

module.exports = {
  predictDailyEnergy,
  predictForDate,
  applyCorrection,
};
