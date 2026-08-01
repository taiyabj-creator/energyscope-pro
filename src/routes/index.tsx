import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CalendarRange,
  Cpu,
  Gauge,
  Home,
  Leaf,
  Sun,
  Sunrise,
  TrendingUp,
  Zap,
} from "lucide-react";
import { MetricCard } from "@/components/cards/MetricCard";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { PowerFlow } from "@/components/widgets/PowerFlow";
import { Chip, Panel, PanelHeading, StatusDot } from "@/components/ui/primitives";
import {
  useEnergyTotals,
  useInverter,
  useLivePower,
  useLogger,
  usePlantInfo,
  useWeatherNow,
} from "@/hooks/useSolarData";
import { formatEnergy, formatPower, trendPct } from "@/utils/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Dashboard — UTL Solar Monitoring" },
      {
        name: "description",
        content:
          "Live solar power, household load, grid import/export and today's yield for a 4.305 kW UTL on-grid plant.",
      },
      { property: "og:title", content: "Live Dashboard — UTL Solar Monitoring" },
      {
        property: "og:description",
        content: "Animated power flow, live metrics and generation charts for your UTL solar plant.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: live, isLoading } = useLivePower();
  const { data: totals } = useEnergyTotals();
  const { data: plant } = usePlantInfo();
  const { data: inverter } = useInverter();
  const { data: logger } = useLogger();
  const { data: weather } = useWeatherNow();

  const solar = formatPower(live?.solarPower ?? 0);
  const load = formatPower(live?.loadPower ?? 0);
  const grid = formatPower(Math.abs(live?.gridPower ?? 0));
  const exporting = (live?.gridPower ?? 0) < 0;
  const updated = live ? new Date(live.timestamp).toLocaleTimeString("en-GB", { hour12: false }) : "—";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current solar power"
          value={solar.value}
          unit={solar.unit}
          icon={Sun}
          tone="solar"
          footnote={`Updated ${updated}`}
          loading={isLoading}
          delay={0}
        />
        <MetricCard
          title="Current load"
          value={load.value}
          unit={load.unit}
          icon={Home}
          tone="load"
          footnote={`Updated ${updated}`}
          loading={isLoading}
          delay={0.05}
        />
        <MetricCard
          title={exporting ? "Grid export" : "Grid import"}
          value={grid.value}
          unit={grid.unit}
          icon={Zap}
          tone="grid"
          footnote={exporting ? "Surplus feeding the grid" : "Drawing from the grid"}
          loading={isLoading}
          delay={0.1}
        />
        <MetricCard
          title="Today's generation"
          value={formatEnergy(totals?.today ?? 0).value}
          unit="kWh"
          icon={Sunrise}
          tone="solar"
          trend={totals ? trendPct(totals.today, totals.todayPrevious) : null}
          footnote="vs yesterday"
          delay={0.15}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Panel delay={0.2}>
          <EnergyChart />
        </Panel>

        <Panel delay={0.25}>
          <PanelHeading
            title="Live power flow"
            subtitle="Energy routing between array, inverter, grid and home"
            action={
              <Chip tone={(live?.solarPower ?? 0) > 40 ? "positive" : "default"}>
                <StatusDot status={(live?.solarPower ?? 0) > 40 ? "online" : "warning"} />
                {(live?.solarPower ?? 0) > 40 ? "Producing" : "Standby"}
              </Chip>
            }
          />
          <PowerFlow />
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="This month"
          value={formatEnergy(totals?.month ?? 0).value}
          unit={formatEnergy(totals?.month ?? 0).unit}
          icon={CalendarRange}
          trend={totals ? trendPct(totals.month, totals.monthPrevious) : null}
          footnote="vs last month"
          delay={0.3}
        />
        <MetricCard
          title="This year"
          value={formatEnergy(totals?.year ?? 0).value}
          unit={formatEnergy(totals?.year ?? 0).unit}
          icon={TrendingUp}
          trend={totals ? trendPct(totals.year, totals.yearPrevious) : null}
          footnote="vs last year"
          delay={0.35}
        />
        <MetricCard
          title="Lifetime generation"
          value={formatEnergy(totals?.total ?? 0).value}
          unit={formatEnergy(totals?.total ?? 0).unit}
          icon={Leaf}
          footnote={`Since ${plant ? new Date(plant.installationDate).getFullYear() : "—"}`}
          delay={0.4}
        />
        <MetricCard
          title="Inverter efficiency"
          value={(inverter?.efficiencyPct ?? 0).toFixed(1)}
          unit="%"
          icon={Gauge}
          footnote={`${inverter?.temperatureC.toFixed(1) ?? "—"} °C internal`}
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
                  {logger?.lastCommunication ?? "—"}
                </span>
              }
            />
            <Row label="Signal" value={`${logger?.rssiDbm ?? "—"} dBm`} />
            <Row label="Capacity" value={`${plant?.capacityKw ?? "—"} kW · on-grid`} />
          </ul>
        </Panel>

        <Panel delay={0.55}>
          <PanelHeading title="Conditions now" subtitle={plant?.location ?? ""} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Condition" value={weather?.condition ?? "—"} />
            <Stat label="Temperature" value={`${weather?.temperatureC ?? "—"} °C`} />
            <Stat label="Irradiance" value={`${weather?.irradianceWm2 ?? "—"} W/m²`} />
            <Stat label="Cloud cover" value={`${weather?.cloudCoverPct ?? "—"} %`} />
            <Stat label="Sunrise" value={weather?.sunrise ?? "—"} />
            <Stat label="Sunset" value={weather?.sunset ?? "—"} />
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

      <Panel delay={0.65} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Activity className="size-3.5" /> Values refresh every 5 seconds
        </span>
        <span>Mock data source — replaceable by the UTL API without UI changes</span>
      </Panel>
    </div>
  );
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
