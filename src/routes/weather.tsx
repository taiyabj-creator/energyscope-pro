import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Info,
  MoonStar,
  SunMedium,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  Zap,
  Timer,
  Navigation,
} from "lucide-react";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import { usePlantInfo, useWeather } from "@/hooks/useSolarData";
import { cn } from "@/lib/utils";
import type { WeatherDay, WeatherNow } from "@/types/solar";

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Weather — UTL Solar Dashboard" },
      {
        name: "description",
        content: "Live weather conditions and forecasts for your solar plant.",
      },
    ],
  }),
  component: WeatherPage,
});

function WeatherPage() {
  const { data: plant } = usePlantInfo();
  const weather = useWeather(plant?.latitude, plant?.longitude);
  const current = weather.data?.current;
  const hourly = weather.data?.hourly ?? [];
  const daily = weather.data?.daily ?? [];

  const weatherIcon = getWeatherIcon(current?.weatherCode ?? 0);

  const solarImpact = useMemo(() => {
    if (!current) return null;
    return calculateSolarImpact(current);
  }, [current]);

  const productionForecast = useMemo(() => {
    if (!current || daily.length === 0) return null;
    const today = daily[0];
    if (!today) return null;
    return calculateProductionForecast(current, today);
  }, [current, daily]);

  const daylightSummary = useMemo(() => {
    if (daily.length === 0) return null;
    const today = daily[0];
    if (!today) return null;
    return {
      sunrise: today.sunrise,
      sunset: today.sunset,
      duration: formatDuration(today.daylightDurationS),
      solarNoon: calculateSolarNoon(today.sunrise, today.sunset),
    };
  }, [daily]);

  const weatherAlerts = useMemo(() => {
    if (!current) return [];
    return getAlerts(current);
  }, [current]);

  const timeline = useMemo(() => {
    if (hourly.length < 24) return [];
    return getTimeline(hourly);
  }, [hourly]);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
              Live weather
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              {plant?.location ?? "Plant weather"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Data is fetched independently from Open-Meteo using the plant coordinates from the
              backend and refreshed every 15 minutes.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur">
            {weather.isLoading ? (
              <Skeleton className="h-24 w-56" />
            ) : weather.isError || !current ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Weather service unavailable</p>
                <p className="text-sm text-slate-400">
                  Live conditions are temporarily unavailable.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-300">
                  {weatherIcon}
                </div>
                <div>
                  <p className="text-3xl font-semibold text-white">
                    {current.temperatureC.toFixed(1)}°C
                  </p>
                  <p className="text-sm text-slate-400">{current.condition}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <WeatherStatCard
            title="Condition"
            value={current?.condition ?? "Weather service unavailable"}
            icon={CloudSun}
            footnote={current ? `${current.cloudCoverPct}% cloud cover` : "Live provider data"}
            loading={weather.isLoading}
          />
          <WeatherStatCard
            title="Feels like"
            value={current ? `${current.feelsLikeC.toFixed(1)}°C` : "—"}
            icon={Thermometer}
            footnote={current ? `Humidity ${current.humidityPct}%` : "Awaiting provider response"}
            loading={weather.isLoading}
          />
          <WeatherStatCard
            title="Wind"
            value={current ? `${current.windKph.toFixed(0)} km/h` : "—"}
            icon={Wind}
            footnote={current ? current.windDirection || "Variable" : "No wind data"}
            loading={weather.isLoading}
          />
          <WeatherStatCard
            title="Pressure"
            value={current ? `${current.pressureHpa.toFixed(0)} hPa` : "—"}
            icon={Gauge}
            footnote={current ? `UV ${current.uvIndex.toFixed(1)}` : "No pressure data"}
            loading={weather.isLoading}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeading title="Solar Production Forecast" subtitle="Estimated generation quality" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !productionForecast ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="flex flex-col items-center justify-center rounded-3xl border border-border/50 bg-muted/20 p-8 text-center md:w-48">
                <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                  Condition
                </p>
                <p
                  className={cn(
                    "mt-2 text-2xl font-bold",
                    productionForecast.quality === "Excellent" && "text-emerald-400",
                    productionForecast.quality === "Very Good" && "text-emerald-400/80",
                    productionForecast.quality === "Good" && "text-amber-400",
                    productionForecast.quality === "Fair" && "text-orange-400",
                    productionForecast.quality === "Poor" && "text-rose-400",
                  )}
                >
                  {productionForecast.quality}
                </p>
                <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={cn(
                      "h-full transition-all duration-1000",
                      productionForecast.quality === "Excellent" && "bg-emerald-400",
                      productionForecast.quality === "Very Good" && "bg-emerald-400/80",
                      productionForecast.quality === "Good" && "bg-amber-400",
                      productionForecast.quality === "Fair" && "bg-orange-400",
                      productionForecast.quality === "Poor" && "bg-rose-400",
                    )}
                    style={{ width: `${productionForecast.confidence}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Confidence: {productionForecast.confidence}%
                </p>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h4 className="font-semibold text-white">Reasoning</h4>
                  <p className="mt-1 text-sm text-slate-400">{productionForecast.reason}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                      Cloud Cover
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {current?.cloudCoverPct}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                      UV Index
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {current?.uvIndex.toFixed(1)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeading title="Weather Alerts" subtitle="Safety and operational notices" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : weatherAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 py-10 text-center">
              <div className="rounded-full bg-emerald-400/10 p-3 text-emerald-400">
                <Zap className="size-6" />
              </div>
              <p className="text-sm font-medium text-slate-300">No weather alerts.</p>
              <p className="text-xs text-slate-500">Operating conditions are normal.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weatherAlerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                >
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                  <div>
                    <p className="font-semibold text-rose-200">{alert.title}</p>
                    <p className="mt-1 text-xs text-rose-300/70">{alert.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <PanelHeading
            title="Day Period Forecast"
            subtitle="Morning, afternoon, evening and night outlook"
          />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : timeline.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {timeline.map((item) => (
                <div
                  key={item.period}
                  className="flex flex-col items-center rounded-2xl border border-border/70 bg-background/70 p-4 text-center"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {item.period}
                  </p>
                  <div className="my-4 text-amber-300">{getWeatherIcon(item.weatherCode)}</div>
                  <p className="text-sm font-medium text-white">{item.condition}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.temp}°C</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeading title="Solar Impact" subtitle="Generation efficiency analysis" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !solarImpact ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-5">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-full p-2",
                      solarImpact.impactType === "negative"
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-emerald-500/10 text-emerald-400",
                    )}
                  >
                    <Info className="size-5" />
                  </div>
                  <p className="font-medium text-white">{solarImpact.title}</p>
                </div>
                <p className="mt-3 text-sm text-slate-400">{solarImpact.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-medium">Efficiency Loss</p>
                  <p
                    className={cn(
                      "text-xl font-bold",
                      solarImpact.efficiencyLoss > 0 ? "text-rose-400" : "text-emerald-400",
                    )}
                  >
                    {solarImpact.efficiencyLoss > 0 ? `-${solarImpact.efficiencyLoss}%` : "Minimal"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-medium">Impact Level</p>
                  <p className="text-xl font-bold text-white capitalize">{solarImpact.level}</p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] items-start">
        <Panel className="self-start h-auto min-w-0">
          <PanelHeading title="Hourly Forecast" subtitle="Hour-by-hour weather conditions" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : weather.isError ? (
            <ErrorState />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
              {hourly.map((hour) => (
                <div
                  key={hour.time}
                  className="min-w-[110px] shrink-0 rounded-2xl border border-border/70 bg-background/70 p-3 text-center"
                >
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {formatHour(hour.time)}
                  </p>
                  <div className="mt-3 flex justify-center text-amber-300">
                    {getWeatherIcon(hour.weatherCode)}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {hour.temperatureC.toFixed(1)}°
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <Droplets className="size-3 text-blue-400" />
                    <p className="text-[10px] font-medium text-slate-400">
                      {hour.rainProbabilityPct}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel>
          <PanelHeading title="Daylight Summary" subtitle="Solar time and visibility" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !daylightSummary ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DaylightMetric label="Sunrise" value={daylightSummary.sunrise} icon={Sunrise} />
                <DaylightMetric label="Sunset" value={daylightSummary.sunset} icon={Sunset} />
                <DaylightMetric label="Daylight" value={daylightSummary.duration} icon={Timer} />
                <DaylightMetric
                  label="Solar Noon"
                  value={daylightSummary.solarNoon}
                  icon={SunMedium}
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeading title="Rain Summary" subtitle="Precipitation and moisture" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !current ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DaylightMetric
                  label="Today's Rain"
                  value={`${current.precipitationMm} mm`}
                  icon={Droplets}
                />
                <DaylightMetric
                  label="Probability"
                  value={`${current.rainProbabilityPct}%`}
                  icon={CloudRain}
                />
                <DaylightMetric
                  label="Humidity"
                  value={`${current.humidityPct}%`}
                  icon={Droplets}
                />
                <DaylightMetric
                  label="Status"
                  value={current.precipitationMm > 0 ? "Raining" : "Dry"}
                  icon={Cloud}
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeading title="Wind Summary" subtitle="Atmospheric movement" />
          {weather.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !current ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DaylightMetric
                  label="Speed"
                  value={`${current.windKph.toFixed(0)} km/h`}
                  icon={Wind}
                />
                <DaylightMetric label="Direction" value={current.windDirection} icon={Navigation} />
                <DaylightMetric
                  label="Gusts"
                  value={`${current.windGustsKph.toFixed(0)} km/h`}
                  icon={Zap}
                />
                <DaylightMetric
                  label="Pressure"
                  value={`${current.pressureHpa.toFixed(0)} hPa`}
                  icon={Gauge}
                />
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DaylightMetric({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="flex items-center gap-2 text-slate-500 mb-1">
        <Icon className="size-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground">
      No data available
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground">
      Weather service unavailable
    </div>
  );
}

function WeatherStatCard({
  title,
  value,
  icon: Icon,
  footnote,
  loading,
}: {
  title: string;
  value: string;
  icon: typeof CloudSun;
  footnote: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-300">{title}</p>
        <div className="rounded-full bg-slate-800 p-2 text-slate-200">
          <Icon className="size-4" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-8 w-24" />
      ) : (
        <p className="mt-4 text-lg font-semibold text-white">{value}</p>
      )}
      <p className="mt-2 text-xs text-slate-400">{footnote}</p>
    </div>
  );
}

function calculateSolarImpact(current: WeatherNow) {
  const cloudImpact = (current.cloudCoverPct / 100) * 30;
  const rainImpact = current.precipitationMm > 0 ? 20 : 0;
  const humidityImpact = current.humidityPct > 80 ? 5 : 0;
  const totalLoss = Math.min(Math.round(cloudImpact + rainImpact + humidityImpact), 100);

  let title = "Optimal Efficiency";
  let description = "Panels should operate near optimal efficiency today.";
  let impactType: "positive" | "negative" = "positive";
  let level = "low";

  if (totalLoss > 40) {
    title = "Significant Reduction";
    description = `Solar generation may decrease by approximately ${totalLoss}% because of heavy cloud cover and precipitation.`;
    impactType = "negative";
    level = "high";
  } else if (totalLoss > 15) {
    title = "Moderate Reduction";
    description = `Solar generation may decrease by approximately ${totalLoss}% because of partial cloud cover.`;
    impactType = "negative";
    level = "moderate";
  }

  return { title, description, impactType, efficiencyLoss: totalLoss, level };
}

function calculateProductionForecast(current: WeatherNow, today: WeatherDay) {
  let score = 100;
  score -= today.cloudCoverPct * 0.4;
  score -= today.rainProbabilityPct * 0.3;
  score -= (10 - Math.min(today.uvIndex, 10)) * 2;

  let quality = "Excellent";
  let reason = "Low cloud cover and high daylight availability.";

  if (score < 30) {
    quality = "Poor";
    reason = "Heavy cloud cover and high rain probability will significantly limit generation.";
  } else if (score < 50) {
    quality = "Fair";
    reason = "Variable cloud cover and potential rain will result in inconsistent generation.";
  } else if (score < 75) {
    quality = "Good";
    reason = "Mostly clear with some light cloud cover expected.";
  } else if (score < 90) {
    quality = "Very Good";
    reason = "Clear skies and high UV index ensure high energy harvest.";
  }

  return { quality, confidence: Math.round(score), reason };
}

function getAlerts(current: WeatherNow) {
  const alerts = [];
  if (current.windKph > 50)
    alerts.push({
      title: "High Wind",
      description: "Sustained high winds may affect light mounting structures.",
    });
  if (current.temperatureC > 40)
    alerts.push({
      title: "Extreme Heat",
      description: "High ambient temperatures may reduce inverter efficiency.",
    });
  if (current.weatherCode >= 95)
    alerts.push({
      title: "Thunderstorm",
      description: "Likely thunderstorms. Risk of electrical surge.",
    });
  if (current.precipitationMm > 20)
    alerts.push({
      title: "Heavy Rain",
      description: "Potential for heavy precipitation affecting visibility and panel cleaning.",
    });
  return alerts;
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

function getTimeline(hourly: any[]) {
  const findClosest = (hour: number) => {
    return hourly.find((h) => new Date(h.time).getHours() === hour) || hourly[0];
  };

  const morning = findClosest(9);
  const afternoon = findClosest(13);
  const evening = findClosest(17);
  const night = findClosest(21);

  const map = (item: any, period: string) => ({
    period,
    weatherCode: item.weatherCode,
    temp: Math.round(item.temperatureC),
    condition: weatherDescription(item.weatherCode),
  });

  return [
    map(morning, "Morning"),
    map(afternoon, "Afternoon"),
    map(evening, "Evening"),
    map(night, "Night"),
  ];
}

function calculateSolarNoon(sunrise: string, sunset: string) {
  if (sunrise === "—" || sunset === "—") return "—";
  try {
    const parse = (t: string) => {
      const [h = 0, m = 0] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const s1 = parse(sunrise);
    const s2 = parse(sunset);
    const noon = Math.round((s1 + s2) / 2);
    const h = Math.floor(noon / 60);
    const m = noon % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatHour(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric" });
}

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function getWeatherIcon(code: number) {
  const iconClassName = "size-6";

  if ([0, 1].includes(code)) return <SunMedium className={iconClassName} />;
  if ([2, 3].includes(code)) return <CloudSun className={iconClassName} />;
  if ([45, 48].includes(code)) return <CloudFog className={iconClassName} />;
  if ([51, 53, 55, 56, 57].includes(code)) return <CloudDrizzle className={iconClassName} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return <CloudRain className={iconClassName} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className={iconClassName} />;
  if ([95, 96, 99].includes(code)) return <CloudLightning className={iconClassName} />;

  return <Cloud className={iconClassName} />;
}
