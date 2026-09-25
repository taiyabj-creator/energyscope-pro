import { useState } from "react";
import { motion } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarRange, Cpu, Gauge, Leaf, Sun, Sunrise, TrendingUp } from "lucide-react";
import { FlipMetricCard } from "@/components/cards/FlipMetricCard";
import { MetricCard } from "@/components/cards/MetricCard";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { PowerFlow } from "@/components/widgets/PowerFlow";
import { Chip, Panel, PanelHeading, StatusDot } from "@/components/ui/primitives";
import {
  useArchiveSummary,
  useEnergyTotals,
  useInverter,
  useLivePower,
  useLogger,
  usePlantInfo,
  usePrediction,
  useTodayDaySeries,
  useWeatherNow,
} from "@/hooks/useSolarData";
import { selectLatestDaySample } from "@/services/solarService";
import { useAlerts } from "@/hooks/useAlerts";
import {
  formatDate,
  formatEnergy,
  formatLifetimeEnergy,
  formatPower,
  trendPct,
} from "@/utils/format";
import { formatMeasurementFreshness } from "@/utils/measurementFreshness";
import { getCapacityPercentage } from "@/utils/capacity";
import { DashboardSkeleton } from "@/components/dashboard/loading/DashboardSkeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Dashboard — UTL Solar Monitoring" },
      {
        name: "description",
        content: "Live solar power and today's yield for your UTL solar plant.",
      },
      { property: "og:title", content: "Live Dashboard — UTL Solar Monitoring" },
      {
        property: "og:description",
        content:
          "Animated power flow, live metrics and generation charts for your UTL solar plant.",
      },
    ],
  }),
  component: DashboardPage,
});

type DataSource = "utl" | "archive";

function DashboardPage() {
  const { data: live, isLoading } = useLivePower();
  const { data: todaySeries, isLoading: todaySeriesLoading } = useTodayDaySeries();
  const { data: totals } = useEnergyTotals();
  const { data: plant } = usePlantInfo();
  const { data: inverter } = useInverter();
  const { data: logger } = useLogger();
  const { data: weather } = useWeatherNow();
  const { alerts, count } = useAlerts();
  const { data: prediction } = usePrediction();

  // Per-card source toggle between UTL and the canonical Archive. Session-only
  // (component state): each of the three Energy Summary cards toggles
  // independently and resets on reload by design.
  const [todaySource, setTodaySource] = useState<DataSource>("utl");
  const [monthSource, setMonthSource] = useState<DataSource>("utl");
  const [yearSource, setYearSource] = useState<DataSource>("utl");

  const archiveEnabled =
    todaySource === "archive" || monthSource === "archive" || yearSource === "archive";
  const { data: archive } = useArchiveSummary(archiveEnabled);

  const toggleSource = (setSource: React.Dispatch<React.SetStateAction<DataSource>>) => () =>
    setSource((current) => (current === "utl" ? "archive" : "utl"));

  const latestSample = selectLatestDaySample(todaySeries);
  const loggerOnline = logger?.status === "online";
  const currentPowerWatts = loggerOnline ? (latestSample?.value ?? 0) : 0;
  const solar = formatPower(currentPowerWatts);
  const capacityPercentage = getCapacityPercentage(currentPowerWatts, plant?.capacityKw);
  const freshness = formatMeasurementFreshness(live?.timestamp);
  if (isLoading && !live && !totals && !plant && !inverter) {
    return <DashboardSkeleton />;
  }

  // --- Energy Summary cards: UTL ⇄ Archive flip -------------------------
  // Each card is a single tap target that flips between the live UTL face and
  // the canonical Archive face (/api/archive/summary): IST calendar days,
  // canonical generation, and "No archive yet" instead of 0 when a period has
  // no row. Both faces stay mounted in FlipMetricCard; the hidden face is
  // invisible (backface-visibility) so the card height never changes.
  const todayArchiveValue = archive?.today ?? null;
  const monthArchiveValue = archive?.month ?? null;
  const yearArchiveValue = archive?.year ?? null;
  const todayOnUtl = todaySource === "utl";
  const monthOnUtl = monthSource === "utl";
  const yearOnUtl = yearSource === "utl";

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        ease: "easeOut",
      }}
    >
      {count > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <h3 className="text-sm font-semibold text-red-400">
            {count} Active Alert{count > 1 ? "s" : ""}
          </h3>

          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <strong>{alert.title}</strong> — {alert.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current solar power"
          value={solar.value}
          unit={solar.unit}
          icon={Sun}
          tone="solar"
          footnote={
            logger && !loggerOnline
              ? "Logger offline · solar readings unavailable"
              : `${capacityPercentage ?? "Not supported"}${capacityPercentage === null ? "" : "% of installed capacity"} · ${latestSample ? `Latest sample ${formatSampleTime(latestSample.timeMinutes)}` : "No samples yet today"}`
          }
          loading={todaySeriesLoading}
          delay={0}
        />
        <FlipMetricCard
          title="Today's generation"
          flipped={!todayOnUtl}
          onToggle={toggleSource(setTodaySource)}
          front={
            <MetricCard
              title="Today's generation"
              value={formatEnergy(totals?.today ?? 0).value}
              unit="kWh"
              icon={Sunrise}
              tone="solar"
              trend={totals ? trendPct(totals.today, totals.todayPrevious) : null}
              footnote={
                totals && totals.todayPrevious === null
                  ? "No comparison data for yesterday"
                  : "vs yesterday"
              }
              source={{
                label: "UTL Data",
                onToggle: toggleSource(setTodaySource),
              }}
              delay={0.1}
            />
          }
          back={
            <MetricCard
              title="Today's generation"
              value={
                todayArchiveValue === null
                  ? archive
                    ? "No archive yet"
                    : ""
                  : formatEnergy(todayArchiveValue).value
              }
              unit={todayArchiveValue !== null ? formatEnergy(todayArchiveValue).unit : undefined}
              icon={Sunrise}
              tone="solar"
              trend={
                todayArchiveValue !== null && archive?.todayPrevious != null
                  ? trendPct(todayArchiveValue, archive.todayPrevious)
                  : null
              }
              footnote={
                todayArchiveValue === null
                  ? archive
                    ? "Today not archived yet"
                    : undefined
                  : archive?.todayUpdatedAt
                    ? `Archive updated ${formatArchiveTime(archive.todayUpdatedAt)}`
                    : archive?.todayPrevious === null
                      ? "No archived value for yesterday"
                      : "vs yesterday"
              }
              loading={!archive}
              source={{
                label: "Archive Data",
                onToggle: toggleSource(setTodaySource),
              }}
              delay={0.1}
            />
          }
        />
        <MetricCard
          title="Expected Today"
          value={prediction?.expectedToday?.toFixed(2) ?? "--"}
          unit="kWh"
          icon={TrendingUp}
          tone="solar"
          footnote={
            prediction
              ? `${prediction.difference >= 0 ? "+" : ""}${prediction.difference.toFixed(2)} kWh ${prediction.differenceLabel} • ${prediction.forecastPercent}% of forecast`
              : "Calculating..."
          }
          delay={0.15}
        />

        <MetricCard
          title="Solar Performance"
          value={prediction?.performance.score ?? "--"}
          unit="%"
          icon={Gauge}
          tone="solar"
          footnote={
            prediction ? `${prediction.performance.status} • Weather-adjusted` : "Calculating..."
          }
          delay={0.2}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Panel delay={0.2}>
          <EnergyChart />
        </Panel>

        <Panel delay={0.25}>
          <PanelHeading
            title="Live power flow"
            subtitle="Latest available AC output from the solar array"
            action={
              <Chip tone={loggerOnline && currentPowerWatts > 40 ? "positive" : "default"}>
                <StatusDot status={loggerOnline && currentPowerWatts > 40 ? "online" : "warning"} />
                {loggerOnline ? (currentPowerWatts > 40 ? "Producing" : "Standby") : "Offline"}
              </Chip>
            }
          />
          <PowerFlow powerWatts={currentPowerWatts} />
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FlipMetricCard
          title="This month"
          flipped={!monthOnUtl}
          onToggle={toggleSource(setMonthSource)}
          front={
            <MetricCard
              title="This month"
              value={formatEnergy(totals?.month ?? 0).value}
              unit={formatEnergy(totals?.month ?? 0).unit}
              icon={CalendarRange}
              trend={totals ? trendPct(totals.month, totals.monthPrevious) : null}
              footnote={
                totals && totals.monthPrevious === null
                  ? "No comparison data for last month"
                  : "vs last month"
              }
              source={{
                label: "UTL Data",
                onToggle: toggleSource(setMonthSource),
              }}
              delay={0.3}
            />
          }
          back={
            <MetricCard
              title="This month"
              value={
                monthArchiveValue === null
                  ? archive
                    ? "No archive yet"
                    : ""
                  : formatEnergy(monthArchiveValue).value
              }
              unit={monthArchiveValue !== null ? formatEnergy(monthArchiveValue).unit : undefined}
              icon={CalendarRange}
              trend={
                monthArchiveValue !== null && archive?.monthPrevious != null
                  ? trendPct(monthArchiveValue, archive.monthPrevious)
                  : null
              }
              footnote={
                monthArchiveValue === null
                  ? archive
                    ? "No archived days this month yet"
                    : undefined
                  : archive?.monthLatest
                    ? `Up to ${formatDate(archive.monthLatest)} · ${archive.monthDays} day${archive.monthDays === 1 ? "" : "s"}`
                    : "vs last month"
              }
              loading={!archive}
              source={{
                label: "Archive Data",
                onToggle: toggleSource(setMonthSource),
              }}
              delay={0.3}
            />
          }
        />
        <FlipMetricCard
          title="This year"
          flipped={!yearOnUtl}
          onToggle={toggleSource(setYearSource)}
          front={
            <MetricCard
              title="This year"
              value={formatEnergy(totals?.year ?? 0).value}
              unit={formatEnergy(totals?.year ?? 0).unit}
              icon={TrendingUp}
              trend={totals ? trendPct(totals.year, totals.yearPrevious) : null}
              footnote={
                totals && totals.yearPrevious === null
                  ? "No comparison data for last year"
                  : "vs last year"
              }
              source={{
                label: "UTL Data",
                onToggle: toggleSource(setYearSource),
              }}
              delay={0.35}
            />
          }
          back={
            <MetricCard
              title="This year"
              value={
                yearArchiveValue === null
                  ? archive
                    ? "No archive yet"
                    : ""
                  : formatEnergy(yearArchiveValue).value
              }
              unit={yearArchiveValue !== null ? formatEnergy(yearArchiveValue).unit : undefined}
              icon={TrendingUp}
              trend={
                yearArchiveValue !== null && archive?.yearPrevious != null
                  ? trendPct(yearArchiveValue, archive.yearPrevious)
                  : null
              }
              footnote={
                yearArchiveValue === null
                  ? archive
                    ? "No archived data this year yet"
                    : undefined
                  : archive?.yearFirst
                    ? `Since ${formatDate(archive.yearFirst)} · ${archive.yearDays} day${archive.yearDays === 1 ? "" : "s"}`
                    : "No comparison data for last year"
              }
              loading={!archive}
              source={{
                label: "Archive Data",
                onToggle: toggleSource(setYearSource),
              }}
              delay={0.35}
            />
          }
        />
        <MetricCard
          title="Lifetime generation"
          value={formatLifetimeEnergy(totals?.total ?? 0).value}
          unit={formatLifetimeEnergy(totals?.total ?? 0).unit}
          icon={Leaf}
          footnote={`Since ${plant ? new Date(plant.installationDate).getFullYear() : "—"}`}
          delay={0.4}
        />
        <MetricCard
          title="Today's Rank"
          value={prediction?.rank?.label ?? "--"}
          icon={TrendingUp}
          tone="neutral"
          footnote={prediction?.rank?.subtitle ?? "Calculating..."}
          delay={0.45}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel delay={0.5}>
          <PanelHeading title="Plant status" subtitle="Connection and equipment health" />
          <ul className="space-y-3 text-sm">
            <Row label="Plant" value={plant?.name ?? "—"} />
            <Row
              label="Inverter"
              value={
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={inverter?.status ?? "warning"} />
                  {inverter?.model ?? "—"}
                </span>
              }
            />
            <Row
              label="Logger"
              value={
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={logger?.status ?? "warning"} />
                  {logger?.status === "online" ? "Online" : "Offline"}
                </span>
              }
            />
            <Row label="Measurements" value={freshness} />
            <Row label="Signal" value={`${logger?.rssiDbm ?? "—"} dBm`} />
            <Row label="Capacity" value={`${plant?.capacityKw ?? "—"} kW · on-grid`} />
          </ul>
        </Panel>

        <Panel delay={0.55}>
          <PanelHeading title="Conditions now" subtitle={plant?.location ?? ""} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Condition" value={weather?.condition ?? "Not provided"} />
            <Stat
              label="Temperature"
              value={weather ? `${weather.temperatureC} °C` : "Not provided"}
            />
            <Stat
              label="Pressure"
              value={weather ? `${weather.pressureHpa.toFixed(0)} hPa` : "Not provided"}
            />
            <Stat
              label="Cloud cover"
              value={weather ? `${weather.cloudCoverPct} %` : "Not provided"}
            />
            <Stat label="Sunrise" value={weather?.sunrise ?? "Not provided"} />
            <Stat label="Sunset" value={weather?.sunset ?? "Not provided"} />
          </div>
        </Panel>

        <Panel delay={0.6}>
          <PanelHeading title="System snapshot" subtitle="Electrical readings from the inverter" />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="AC voltage" value={`${inverter?.acVoltage.toFixed(1) ?? "—"} V`} />
            <Stat label="Frequency" value={`${inverter?.acFrequency.toFixed(2) ?? "—"} Hz`} />
            <Stat label="DC voltage" value={`${inverter?.dcVoltage.toFixed(1) ?? "—"} V`} />
            <Stat label="DC current" value={`${inverter?.dcCurrent.toFixed(1) ?? "—"} A`} />

            <Stat label="Firmware" value={inverter?.firmware ?? "—"} />
            <Stat label="Serial" value={inverter?.serial ?? "—"} />
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="size-3.5" /> Battery storage not installed
          </p>
        </Panel>
      </div>

      <Panel
        delay={0.65}
        className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <Activity className="size-3.5" /> Values refresh every 60 seconds
        </span>
        <span>Measurements and generation are supplied by the UTL backend.</span>
      </Panel>
    </motion.div>
  );
}

function formatSampleTime(timeMinutes?: number): string {
  if (timeMinutes == null || !Number.isFinite(timeMinutes)) return "unavailable";
  const total = Math.round(timeMinutes);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

const ARCHIVE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "10:00 AM" in Asia/Kolkata from a ms-since-epoch archive write timestamp. */
function formatArchiveTime(ms: number): string {
  return ARCHIVE_TIME_FORMATTER.format(new Date(ms));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
