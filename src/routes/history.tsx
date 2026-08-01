import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import { useDailyHistory, useMonthlyHistory, useYearlyHistory } from "@/hooks/useSolarData";
import { downloadCsv, formatDate } from "@/utils/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Daily, monthly and yearly generation history for your UTL solar plant with CSV export.",
      },
      { property: "og:title", content: "History — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Browse daily, monthly and yearly generation records and export them as CSV.",
      },
    ],
  }),
  component: HistoryPage,
});

type Tab = "daily" | "monthly" | "yearly";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function HistoryPage() {
  const [tab, setTab] = useState<Tab>("daily");
  const daily = useDailyHistory();
  const monthly = useMonthlyHistory();
  const yearly = useYearlyHistory();

  const loading =
    (tab === "daily" && !daily.data) ||
    (tab === "monthly" && !monthly.data) ||
    (tab === "yearly" && !yearly.data);

  const exportRows = () => {
    if (tab === "daily" && daily.data)
      downloadCsv(
        "utl-solar-daily-history.csv",
        daily.data.map((r) => ({
          Date: r.date,
          "Generation (kWh)": r.generation,
          "Peak power (W)": r.peakPower,
          "Sun hours": r.sunHours,
          Weather: r.weather,
        })),
      );
    if (tab === "monthly" && monthly.data)
      downloadCsv(
        "utl-solar-monthly-history.csv",
        monthly.data.map((r) => ({
          Month: r.month,
          "Generation (kWh)": r.generation,
          "Best day (kWh)": r.bestDay,
          "Average daily (kWh)": r.averageDaily,
        })),
      );
    if (tab === "yearly" && yearly.data)
      downloadCsv(
        "utl-solar-yearly-history.csv",
        yearly.data.map((r) => ({
          Year: r.year,
          "Generation (kWh)": r.generation,
          "Average daily (kWh)": r.averageDaily,
          "Performance ratio (%)": r.performanceRatio,
        })),
      );
  };

  return (
    <Panel>
      <PanelHeading
        title="Generation history"
        subtitle="Recorded yield per period — export any view for your own records"
        action={
          <button
            type="button"
            onClick={exportRows}
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Download className="size-3.5" /> Export CSV
          </button>
        }
      />

      <div
        role="tablist"
        aria-label="History range"
        className="mb-5 inline-flex rounded-xl border border-border/70 bg-muted/30 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="scroll-slim -mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                {tab === "daily" && (
                  <>
                    <Th>Date</Th>
                    <Th>Generation</Th>
                    <Th>Peak power</Th>
                    <Th>Sun hours</Th>
                    <Th>Weather</Th>
                  </>
                )}
                {tab === "monthly" && (
                  <>
                    <Th>Month</Th>
                    <Th>Generation</Th>
                    <Th>Best day</Th>
                    <Th>Average daily</Th>
                  </>
                )}
                {tab === "yearly" && (
                  <>
                    <Th>Year</Th>
                    <Th>Generation</Th>
                    <Th>Average daily</Th>
                    <Th>Performance ratio</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tab === "daily" &&
                daily.data!.map((r) => (
                  <tr key={r.date} className="border-t border-border/50 hover:bg-muted/30">
                    <Td>{formatDate(r.date)}</Td>
                    <Td className="num">{r.generation.toFixed(2)} kWh</Td>
                    <Td className="num">{r.peakPower} W</Td>
                    <Td className="num">{r.sunHours}</Td>
                    <Td className="text-muted-foreground">{r.weather}</Td>
                  </tr>
                ))}
              {tab === "monthly" &&
                monthly.data!.map((r) => (
                  <tr key={r.month} className="border-t border-border/50 hover:bg-muted/30">
                    <Td>{r.month}</Td>
                    <Td className="num">{r.generation} kWh</Td>
                    <Td className="num">{r.bestDay} kWh</Td>
                    <Td className="num">{r.averageDaily} kWh</Td>
                  </tr>
                ))}
              {tab === "yearly" &&
                yearly.data!.map((r) => (
                  <tr key={r.year} className="border-t border-border/50 hover:bg-muted/30">
                    <Td>{r.year}</Td>
                    <Td className="num">{r.generation} kWh</Td>
                    <Td className="num">{r.averageDaily} kWh</Td>
                    <Td className="num">{r.performanceRatio}%</Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5", className)}>{children}</td>;
}
