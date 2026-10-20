import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, Leaf, Sun, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/cards/MetricCard";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { PowerFlow } from "@/components/widgets/PowerFlow";
import { Panel, PanelHeading } from "@/components/ui/primitives";
import {
  useArchiveSummary,
  useEnergyTotals,
  useLogger,
  useTodayDaySeries,
} from "@/hooks/useSolarData";
import { selectLatestDaySample } from "@/services/solarService";
import { formatEnergy, formatLifetimeEnergy, formatPower } from "@/utils/format";

export const Route = createFileRoute("/energy")({
  head: () => ({
    meta: [
      { title: "Energy Flow — UTL Solar Dashboard" },
      {
        name: "description",
        content: "Latest available AC output from the solar array and inverter.",
      },
      { property: "og:title", content: "Energy Flow — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Animated solar power flow and generation history for your plant.",
      },
    ],
  }),
  component: EnergyPage,
});

function EnergyPage() {
  const { data: todaySeries } = useTodayDaySeries();
  const { data: totals } = useEnergyTotals();
  const { data: logger } = useLogger();
  // Monthly / yearly history is canonical display history, so it comes from the
  // EnergyScope Archive; lifetime generation is the UTL inverter's cumulative
  // counter and today stays on the live UTL source.
  const { data: archive } = useArchiveSummary();

  const loggerOnline = logger?.status === "online";
  const currentPowerWatts = loggerOnline ? (selectLatestDaySample(todaySeries)?.value ?? 0) : 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Solar generation"
          value={formatPower(currentPowerWatts).value}
          unit={formatPower(currentPowerWatts).unit}
          icon={Sun}
          tone="solar"
          footnote={logger && !loggerOnline ? "Logger offline" : "Latest Day-chart sample"}
        />
        <MetricCard
          title="Today"
          value={formatEnergy(totals?.today ?? 0).value}
          unit="kWh"
          icon={Sun}
          tone="solar"
          footnote="Cumulative since midnight (UTL)"
        />
        <MetricCard
          title="This month"
          value={archive?.month != null ? formatEnergy(archive.month).value : "—"}
          unit={archive?.month != null ? formatEnergy(archive.month).unit : undefined}
          icon={CalendarRange}
          tone="solar"
          footnote="EnergyScope Archive · recorded days"
        />
        <MetricCard
          title="This year"
          value={archive?.year != null ? formatEnergy(archive.year).value : "—"}
          unit={archive?.year != null ? formatEnergy(archive.year).unit : undefined}
          icon={TrendingUp}
          tone="solar"
          footnote="EnergyScope Archive · recorded days"
        />
        <MetricCard
          title="Lifetime"
          value={totals?.total != null ? formatLifetimeEnergy(totals.total).value : "—"}
          unit={totals?.total != null ? formatLifetimeEnergy(totals.total).unit : undefined}
          icon={Leaf}
          tone="solar"
          footnote={
            totals?.total != null
              ? "UTL Solar RMS · cumulative inverter output"
              : "Lifetime value unavailable from UTL"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel delay={0.1}>
          <PanelHeading title="Power flow" subtitle="Solar generation and inverter output" />
          <PowerFlow powerWatts={currentPowerWatts} />
        </Panel>
        <Panel delay={0.15}>
          <EnergyChart />
        </Panel>
      </div>
    </div>
  );
}
