import { createFileRoute } from "@tanstack/react-router";
import { CloudSun, Droplets, Gauge, Sun, Thermometer, Wind } from "lucide-react";
import { MetricCard } from "@/components/cards/MetricCard";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import { usePlantInfo, useWeatherForecast, useWeatherNow } from "@/hooks/useSolarData";

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Weather Intelligence — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Current conditions, solar irradiance, cloud cover and a 7-day forecast with expected generation for your plant location.",
      },
      { property: "og:title", content: "Weather Intelligence — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Irradiance, cloud cover and forecast yield to explain production changes.",
      },
    ],
  }),
  component: WeatherPage,
});

function WeatherPage() {
  const { data: now } = useWeatherNow();
  const { data: forecast } = useWeatherForecast();
  const { data: plant } = usePlantInfo();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Solar irradiance"
          value={String(now?.irradianceWm2 ?? "—")}
          unit="W/m²"
          icon={Sun}
          tone="solar"
          footnote="Plane of array estimate"
        />
        <MetricCard
          title="Cloud cover"
          value={String(now?.cloudCoverPct ?? "—")}
          unit="%"
          icon={CloudSun}
          footnote={now?.condition ?? ""}
        />
        <MetricCard
          title="Temperature"
          value={(now?.temperatureC ?? 0).toFixed(1)}
          unit="°C"
          icon={Thermometer}
          tone="grid"
          footnote={`Feels like ${now?.feelsLikeC ?? "—"} °C`}
        />
        <MetricCard
          title="Rain probability"
          value={String(now?.rainProbabilityPct ?? "—")}
          unit="%"
          icon={Droplets}
          tone="load"
          footnote="Next 24 hours"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel delay={0.1}>
          <PanelHeading
            title="Current conditions"
            subtitle={`${plant?.location ?? ""} · ${plant?.latitude.toFixed(3) ?? ""}, ${plant?.longitude.toFixed(3) ?? ""}`}
          />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Condition" value={now?.condition ?? "—"} />
            <Field label="Humidity" value={`${now?.humidityPct ?? "—"} %`} />
            <Field label="Wind" value={`${now?.windKph ?? "—"} km/h ${now?.windDirection ?? ""}`} icon={Wind} />
            <Field label="UV index" value={String(now?.uvIndex ?? "—")} icon={Gauge} />
            <Field label="Sunrise" value={now?.sunrise ?? "—"} />
            <Field label="Sunset" value={now?.sunset ?? "—"} />
          </div>
          <p className="mt-5 rounded-2xl border border-border/70 bg-muted/25 p-4 text-xs text-muted-foreground">
            Weather is a companion feature of this dashboard, used to explain production changes. It
            is not inverter data.
          </p>
        </Panel>

        <Panel delay={0.15}>
          <PanelHeading title="7-day forecast" subtitle="Expected yield derived from cloud cover" />
          {!forecast ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ul className="divide-y divide-border/50">
              {forecast.map((d) => (
                <li
                  key={d.day}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[110px_minmax(0,1fr)_auto]"
                >
                  <p className="min-w-0 truncate text-sm font-medium">{d.day}</p>
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">
                    {d.condition} · {d.cloudCoverPct}% cloud · {d.rainProbabilityPct}% rain
                  </p>
                  <div className="flex shrink-0 items-center gap-4 text-right">
                    <span className="num text-xs text-muted-foreground">
                      {d.lowC}° / {d.highC}°
                    </span>
                    <span className="num w-20 text-sm font-semibold text-solar">
                      {d.expectedKwh} kWh
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Wind;
}) {
  return (
    <div className="min-w-0">
      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </p>
      <p className="num mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
