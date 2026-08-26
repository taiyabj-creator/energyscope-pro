import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
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

interface ChartTooltipPayload {
  color: string;
  dataKey: string;
  name: string;
  value: number | string;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel-solid px-3 py-2 text-xs">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
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
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data, isLoading } = useEnergySeries(range, selectedDate);

  const today = new Date();

  const maxDay = today.toISOString().slice(0, 10);

  const maxMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const isAtLatest =
    (range === "day" && selectedDate.toISOString().slice(0, 10) === maxDay) ||
    (range === "month" &&
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth()) ||
    (range === "year" && selectedDate.getFullYear() === today.getFullYear());

  const unit = range === "day" ? "kW" : "kWh";
  const isBar = range !== "day";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">Generation profile</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {range === "day" ? "Instantaneous solar generation" : "Energy yield from UTL history"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate);

              if (range === "day") d.setDate(d.getDate() - 1);
              else if (range === "month") d.setMonth(d.getMonth() - 1);
              else if (range === "year") d.setFullYear(d.getFullYear() - 1);

              setSelectedDate(d);
            }}
            disabled={range === "total"}

            className="rounded-lg border border-border px-2 py-2 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>

          <input
            type={
              range === "day"
                ? "date"
                : range === "month"
                  ? "month"
                  : range === "year"
                    ? "number"
                    : "text"
            }
            disabled={range === "total"}
            min={range === "year" ? "2000" : undefined}
            max={
              range === "day"
                ? maxDay
                : range === "month"
                  ? maxMonth
                  : range === "year"
                    ? String(today.getFullYear())
                    : undefined
            }
            value={
              range === "day"
                ? selectedDate.toISOString().slice(0, 10)
                : range === "month"
                  ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`
                  : range === "year"
                    ? String(selectedDate.getFullYear())
                    : "Lifetime"
            }
            onChange={(e) => {
              if (range === "day") {
                setSelectedDate(new Date(e.target.value));
              } else if (range === "month") {
                setSelectedDate(new Date(`${e.target.value}-01T00:00:00`));
              } else if (range === "year") {
                setSelectedDate(new Date(Number(e.target.value), 0, 1));
              }
            }}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => {
              const d = new Date(selectedDate);

              if (range === "day") d.setDate(d.getDate() + 1);
              else if (range === "month") d.setMonth(d.getMonth() + 1);
              else if (range === "year") d.setFullYear(d.getFullYear() + 1);

              setSelectedDate(d);
            }}
            disabled={range === "total"}
            className="rounded-lg border border-border px-2 py-2 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>

          <div
            role="tablist"
            aria-label="Chart range"
            className="flex rounded-xl border border-border/70 bg-muted/30 p-1"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-medium",
                  range === r.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[300px] w-full">
        {isLoading || !data ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {isBar ? (
              <BarChart data={data} barCategoryGap={range === "month" ? "25%" : "70%"} barGap={0}>
                <CartesianGrid stroke="#444" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip content={<ChartTooltip unit={unit} />} />
                <Legend />

                <Bar
                  dataKey="value"
                  name="Energy"
                  fill="var(--solar)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={range === "month" ? 42 : 120}
                />
              </BarChart>
            ) : (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="fillSolar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--solar)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--solar)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="#444" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip content={<ChartTooltip unit={unit} />} />
                <Legend />

                <Area
                  type="monotone"
                  dataKey="value"
                  name="Energy"
                  stroke="var(--solar)"
                  strokeWidth={2}
                  fill="url(#fillSolar)"
                  dot={false}
                  animationDuration={900}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
