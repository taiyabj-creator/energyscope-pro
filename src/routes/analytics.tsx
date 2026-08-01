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
import { useAnalyticsSummary, useEnergySeries, useHeatmap } from "@/hooks/useSolarData";
import { formatDate } from "@/utils/format";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Production trends, performance ratio, best and worst production days and a yearly generation heatmap.",
      },
      { property: "og:title", content: "Analytics — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Trends, performance comparison and a monthly generation heatmap.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: summary } = useAnalyticsSummary();
  const { data: monthly } = useEnergySeries("year");
  const { data: heatmap } = useHeatmap();

  const max = Math.max(1, ...(heatmap ?? []).map((c) => c.value));
  const months = [...new Set((heatmap ?? []).map((c) => c.month))];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Average daily yield"
          value={(summary?.averageDaily ?? 0).toFixed(1)}
          unit="kWh"
          icon={LineChartIcon}
          tone="solar"
          footnote="Rolling 12 months"
        />
        <MetricCard
          title="Specific yield"
          value={(summary?.specificYield ?? 0).toFixed(2)}
          unit="kWh/kWp"
          icon={Gauge}
          footnote="Per installed kilowatt"
        />
        <MetricCard
          title="Best production day"
          value={(summary?.bestDay.generation ?? 0).toFixed(2)}
          unit="kWh"
          icon={Award}
          tone="battery"
          footnote={summary ? formatDate(summary.bestDay.date) : ""}
        />
        <MetricCard
          title="Worst production day"
          value={(summary?.worstDay.generation ?? 0).toFixed(2)}
          unit="kWh"
          icon={CalendarX}
          tone="grid"
          footnote={summary ? formatDate(summary.worstDay.date) : ""}
        />
      </div>

      <Panel delay={0.1}>
        <PanelHeading
          title="Production trend"
          subtitle={`Monthly yield against the previous year · performance ratio ${summary?.performanceRatio ?? "—"}%`}
        />
        <div className="h-[320px]">
          {!monthly ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="This year"
                  stroke="var(--solar)"
                  strokeWidth={2.4}
                  dot={{ r: 3 }}
                  animationDuration={900}
                />
                <Line
                  type="monotone"
                  dataKey="compare"
                  name="Last year"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  dot={false}
                  animationDuration={900}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel delay={0.15}>
          <PanelHeading
            title="Generation heatmap"
            subtitle="Daily yield across the year — darker cells mean lower production"
          />
          <div className="scroll-slim overflow-x-auto pb-2">
            <div className="min-w-[640px] space-y-1.5">
              {months.map((month) => (
                <div key={month} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
                    {month}
                  </span>
                  <div className="flex gap-[3px]">
                    {(heatmap ?? [])
                      .filter((c) => c.month === month)
                      .map((c) => (
                        <span
                          key={`${month}-${c.day}`}
                          title={`${month} ${c.day}: ${c.value} kWh`}
                          className="size-[13px] rounded-[3px] transition-transform hover:scale-125"
                          style={{
                            background: `color-mix(in oklab, var(--solar) ${Math.round((c.value / max) * 100)}%, var(--muted))`,
                          }}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel delay={0.2}>
          <PanelHeading title="Performance comparison" subtitle="Insight cards from production history" />
          <div className="space-y-3">
            <Insight
              title="Month over month"
              value={`${(summary?.monthOverMonthPct ?? 0).toFixed(1)}%`}
              detail="Lower yield tracks a cloudier month rather than a plant fault."
              negative={(summary?.monthOverMonthPct ?? 0) < 0}
            />
            <Insight
              title="Today vs monthly average"
              value="+21.0%"
              detail="Today is running ahead of the monthly average daily generation."
            />
            <Insight
              title="Monthly vs yearly average"
              value="-4.2%"
              detail="Seasonal variation; within the expected range for this location."
              negative
            />
            <Insight
              title="Long-term trend"
              value="-0.6%/yr"
              detail="Consistent with normal module degradation for a 3-year-old array."
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
  detail,
  negative,
}: {
  title: string;
  value: string;
  detail: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className={`num text-sm font-semibold ${negative ? "text-destructive" : "text-positive"}`}>
          {value}
        </p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
