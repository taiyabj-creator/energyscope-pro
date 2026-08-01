import { createFileRoute } from "@tanstack/react-router";
import { Home, Sun, Zap } from "lucide-react";
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
        content:
          "Real-time energy routing between the solar array, inverter, grid and household load, with self-consumption breakdown.",
      },
      { property: "og:title", content: "Energy Flow — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Animated power flow and self-consumption balance for your solar plant.",
      },
    ],
  }),
  component: EnergyPage,
});

function EnergyPage() {
  const { data: live } = useLivePower();
  const { data: totals } = useEnergyTotals();

  const solar = live?.solarPower ?? 0;
  const load = live?.loadPower ?? 0;
  const grid = live?.gridPower ?? 0;
  const selfUse = Math.min(solar, load);
  const selfPct = solar > 0 ? (selfUse / solar) * 100 : 0;

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
          title="Self-consumption"
          value={selfPct.toFixed(0)}
          unit="%"
          icon={Home}
          tone="load"
          footnote={`${formatPower(selfUse).value} ${formatPower(selfUse).unit} used on site`}
        />
        <MetricCard
          title={grid < 0 ? "Exporting" : "Importing"}
          value={formatPower(Math.abs(grid)).value}
          unit={formatPower(Math.abs(grid)).unit}
          icon={Zap}
          tone="grid"
          footnote={grid < 0 ? "Surplus to grid" : "Deficit from grid"}
        />
        <MetricCard
          title="Energy today"
          value={formatEnergy(totals?.today ?? 0).value}
          unit="kWh"
          icon={Sun}
          tone="solar"
          footnote="Cumulative since midnight"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel delay={0.1}>
          <PanelHeading title="Power flow" subtitle="Direction reverses automatically with surplus" />
          <PowerFlow />
        </Panel>
        <Panel delay={0.15}>
          <EnergyChart />
        </Panel>
      </div>
    </div>
  );
}
