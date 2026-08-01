import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useEnergySeries } from "@/hooks/useSolarData";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { EnergyRange } from "@/types/solar";

const RANGES: { key: EnergyRange; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "total", label: "Total" },
];

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 };

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel-solid px-3 py-2 text-xs">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="num font-semibold text-foreground">{p.value}</span> {unit}
        </p>
      ))}
    </div>
  );
}

export function EnergyChart() {
  const [range, setRange] = useState<EnergyRange>("day");
  const { data, isLoading } = useEnergySeries(range);
  const unit = range === "day" ? "kW" : "kWh";
  const isBar = range === "year" || range === "total";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">Generation profile</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {range === "day"
              ? "Instantaneous power vs household load"
              : "Energy yield compared with the previous period"}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Chart range"
          className="flex shrink-0 rounded-xl border border-border/70 bg-muted/30 p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs",
                range === r.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px] w-full">
        {isLoading || !data ? (
          <Skeleton className="h-full w-full" />
        ) : (
       <ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <defs>
      <linearGradient id="fillSolar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--solar)" stopOpacity={0.45} />
        <stop offset="100%" stopColor="var(--solar)" stopOpacity={0.02} />
      </linearGradient>
    </defs>

    <CartesianGrid stroke="#444" />
    <XAxis dataKey="label" />
    <YAxis />
    <Tooltip content={<ChartTooltip unit={unit} />} />
    <Legend />

    <Area
      type="monotone"
      dataKey="value"
      name="Solar power"
      stroke="var(--solar)"
      strokeWidth={2}
      fill="url(#fillSolar)"
      dot={false}
      animationDuration={900}
    />
  </AreaChart>
</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
