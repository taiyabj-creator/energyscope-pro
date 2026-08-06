import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, Leaf, Sun, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/cards/MetricCard";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { PowerFlow } from "@/components/widgets/PowerFlow";
import { Panel, PanelHeading } from "@/components/ui/primitives";
import { useEnergyTotals, useLivePower } from "@/hooks/useSolarData";
import { formatEnergy, formatPower } from "@/utils/format";

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
  const { data: live } = useLivePower();
  const { data: totals } = useEnergyTotals();

  const solar = live?.solarPower ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Solar generation"
          value={formatPower(solar).value}
          unit={formatPower(solar).unit}
          icon={Sun}
          tone="solar"
          footnote="Live from inverter"
        />
        <MetricCard
          title="Today"
          value={formatEnergy(totals?.today ?? 0).value}
          unit="kWh"
          icon={Sun}
          tone="solar"
          footnote="Cumulative since midnight"
        />
        <MetricCard
          title="This month"
          value={formatEnergy(totals?.month ?? 0).value}
          unit={formatEnergy(totals?.month ?? 0).unit}
          icon={CalendarRange}
          tone="solar"
          footnote="UTL monthly chart"
        />
        <MetricCard
          title="This year"
          value={formatEnergy(totals?.year ?? 0).value}
          unit={formatEnergy(totals?.year ?? 0).unit}
          icon={TrendingUp}
          tone="solar"
          footnote="Sum of UTL yearly chart months"
        />
        <MetricCard
          title="Lifetime"
          value={formatEnergy(totals?.total ?? 0).value}
          unit={formatEnergy(totals?.total ?? 0).unit}
          icon={Leaf}
          tone="solar"
          footnote="Inverter lifetime total"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel delay={0.1}>
          <PanelHeading title="Power flow" subtitle="Solar generation and inverter output" />
          <PowerFlow />
        </Panel>
        <Panel delay={0.15}>
          <EnergyChart />
        </Panel>
      </div>
    </div>
  );
}
