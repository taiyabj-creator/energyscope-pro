import { createFileRoute } from "@tanstack/react-router";
import { Award, CalendarX, Gauge, LineChart as LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/cards/MetricCard";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import { useAnalyticsData } from "@/hooks/useSolarData";
import { formatDate } from "@/utils/format";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — UTL Solar Dashboard" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const year = new Date().getFullYear();
  const { data } = useAnalyticsData(year);
  const summary = data?.summary;
  const heatmap = data?.heatmap ?? [];
  const max = Math.max(1, ...heatmap.map((cell) => cell.value));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Average daily yield"
          value={summary ? summary.averageDaily.toFixed(2) : "—"}
          unit="kWh"
          icon={LineChartIcon}
          tone="solar"
          footnote={`${year} recorded days`}
        />
        <MetricCard
          title="Specific yield"
          value={summary ? summary.specificYield.toFixed(2) : "—"}
          unit="kWh/kWp"
          icon={Gauge}
          footnote="Year-to-date production / installed capacity"
        />
        <MetricCard
          title="Best production day"
          value={summary ? summary.bestDay.generation.toFixed(2) : "—"}
          unit="kWh"
          icon={Award}
          tone="battery"
          footnote={summary ? displayDate(summary.bestDay.date) : "Not available"}
        />
        <MetricCard
          title="Worst production day"
          value={summary ? summary.worstDay.generation.toFixed(2) : "—"}
          unit="kWh"
          icon={CalendarX}
          tone="neutral"
          footnote={summary ? displayDate(summary.worstDay.date) : "Not available"}
        />
      </div>

      <Panel delay={0.1}>
        <PanelHeading
          title="Monthly production trend"
          subtitle={`UTL yearly chart data for ${year}`}
        />
        <div className="h-[320px]">
          {!data ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyTrend} margin={{ top: 8, right: 8, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  tick={{ fill: "#00D9FF", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  tick={{ fill: "#00D9FF", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${Number(value).toFixed(2)} kWh`, "Production"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Production"
                  stroke="var(--solar)"
                  strokeWidth={2.4}
                  dot={{ r: 3, fill: "#F5F7FA", stroke: "#F5B83D", strokeWidth: 2 }}
                  animationDuration={900}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel delay={0.15} className="min-w-0">
          <PanelHeading
            title="Generation heatmap"
            subtitle="Daily production returned by each monthly UTL chart; missing dates are blank"
          />
          {!data ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="scroll-slim overflow-x-auto pb-2">
              <div className="min-w-[640px] space-y-1.5">
                {Array.from({ length: 12 }, (_, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
                      {new Date(year, index).toLocaleString("en", { month: "short" })}
                    </span>
                    <div className="flex gap-[3px]">
                      {Array.from(
                        { length: new Date(year, index + 1, 0).getDate() },
                        (_, dayIndex) => {
                          const cell = heatmap.find(
                            (item) =>
                              item.month ===
                                new Date(year, index).toLocaleString("en", { month: "short" }) &&
                              item.day === dayIndex + 1,
                          );
                          return (
                            <span
                              key={dayIndex}
                              title={
                                cell
                                  ? `${cell.month} ${cell.day}: ${cell.value.toFixed(2)} kWh`
                                  : "No data"
                              }
                              className="size-[13px] rounded-[3px]"
                              style={{
                                background: cell
                                  ? `color-mix(in oklab, var(--solar) ${Math.round((cell.value / max) * 100)}%, var(--muted))`
                                  : "var(--muted)",
                              }}
                            />
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel delay={0.2}>
          <PanelHeading
            title="Performance comparison"
            subtitle="Calculated only where UTL history supports it"
          />
          <div className="space-y-3">
            <Insight
              title="Month over month"
              value={summary ? `${summary.monthOverMonthPct.toFixed(1)}%` : "Not available"}
            />
            <Insight
              title="Current month daily average"
              value={
                data?.currentMonthAverage === null || data?.currentMonthAverage === undefined
                  ? "Not available"
                  : `${data.currentMonthAverage.toFixed(2)} kWh`
              }
            />
            <Insight
              title="Performance ratio"
              value="Not available"
              detail="Irradiance data is not provided by the UTL production endpoints."
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Insight({
  title,
  value,
  detail = "Calculated from UTL chart data.",
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="num text-sm font-semibold text-primary">{value}</p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function displayDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : "—";
}
