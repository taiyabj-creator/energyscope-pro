const fetch = global.fetch;

async function getWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    current: "cloud_cover,precipitation_probability,weather_code,uv_index",
    daily: "sunrise,sunset",
    forecast_days: "1",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error("Unable to fetch weather");
  }

  const data = await response.json();

  return {
    cloudCover: data.current.cloud_cover ?? 0,
    rainProbability: data.current.precipitation_probability ?? 0,
    weatherCode: data.current.weather_code ?? 0,
    uvIndex: data.current.uv_index ?? 0,
    sunrise: data.daily.sunrise?.[0],
    sunset: data.daily.sunset?.[0],
  };
}

module.exports = {
  getWeather,
};
