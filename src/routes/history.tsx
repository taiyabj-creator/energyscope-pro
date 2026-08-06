import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer, Search } from "lucide-react";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import { useDailyHistory, useMonthlyHistory, useYearlyHistory } from "@/hooks/useSolarData";
import { cn } from "@/lib/utils";
import { downloadCsv, formatDate } from "@/utils/format";
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
} from "recharts";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — UTL Solar Dashboard" }] }),
  component: HistoryPage,
});

type Tab = "daily" | "monthly" | "yearly" | "total";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
  { key: "total", label: "Total" },
];

function HistoryPage() {
  const [tab, setTab] = useState<Tab>("daily");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const daily = useDailyHistory(selectedDate);
const monthly = useMonthlyHistory(selectedDate.getFullYear());
const yearly = useYearlyHistory();

const total = yearly;

const rows =
  tab === "daily"
    ? (daily.data ?? []).map((row) => ({
        period: row.date,
        generation: row.generation,
      }))
    : tab === "monthly"
      ? (monthly.data ?? []).map((row) => ({
          period: row.month,
          generation: row.generation,
        }))
      : tab === "yearly"
        ? (yearly.data ?? []).map((row) => ({
            period: row.year,
            generation: row.generation,
          }))
        : (total.data ?? []).map((row) => ({
            period: row.year,
            generation: row.generation,
          }));
  const filteredRows = useMemo(
    () => rows.filter((row) => row.period.toLowerCase().includes(search.trim().toLowerCase())),
    [rows, search],
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [tab, selectedDate, search]);

  const exportRows = () =>
    downloadCsv(
      `utl-solar-${tab}-history.csv`,
      filteredRows.map((row) => ({
        [tab === "daily" ? "Date" : tab === "monthly" ? "Month" : "Year"]: row.period,
        "Generation (kWh)": row.generation,
      })),
    );

  return (
    <Panel>
      <PanelHeading
        title="Generation history"
        subtitle="Recorded UTL production only"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportRows}
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/60"
            >
              <Download className="size-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/60"
            >
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="History range"
          className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                tab === item.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
                        {tab === "daily" ? (
          <input
            type="month"
            value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`}
            max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
            onChange={(event) => {
          const date = event.currentTarget.valueAsDate;
               if (date) {
              setSelectedDate(date);
                }
              }}
            className="rounded-xl border border-border/70 bg-card px-3 py-1.5 text-xs"
            aria-label="Select month"
          />
        ) : tab === "monthly" ? (
          <input
            type="number"
            min="2000"
            max={String(new Date().getFullYear())}
            value={selectedDate.getFullYear()}
            onChange={(event) =>
              setSelectedDate(new Date(Number(event.target.value), 0, 1))
            }
            className="rounded-xl border border-border/70 bg-card px-3 py-1.5 text-xs"
            aria-label="Select year"
          />
        ) : null}
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab === "daily" ? "dates" : tab === "monthly" ? "months" : "years"}`}
            className="w-full rounded-xl border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs"
            aria-label="Search history"

          />
        </label>
      </div>
     {(tab === "daily" && daily.isLoading) ||
(tab === "monthly" && monthly.isLoading) ||
((tab === "yearly" || tab === "total") && yearly.isLoading) ? (

        <Skeleton className="h-72 w-full" />
      ) : (
        <>
  <div className="mb-6 h-[320px] w-full">
  <ResponsiveContainer width="100%" height="100%">
        {tab === "daily" ? (
      <AreaChart data={visibleRows}>
        <CartesianGrid stroke="#444" strokeDasharray="3 3" />

        <XAxis
          dataKey="period"
          tick={{ fontSize: 11 }}
        />

        <YAxis
          tick={{ fontSize: 11 }}
        />

        <Tooltip
          formatter={(value: number) => [
            `${Number(value).toFixed(2)} kWh`,
            "Generation",
          ]}
        />

        <Area
          type="monotone"
          dataKey="generation"
          stroke="var(--solar)"
          fill="var(--solar)"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </AreaChart>
    ) : (
      <BarChart data={visibleRows} barCategoryGap="25%">
        <CartesianGrid stroke="#444" strokeDasharray="3 3" />

        <XAxis
          dataKey="period"
          tick={{ fontSize: 11 }}
        />

        <YAxis
          tick={{ fontSize: 11 }}
        />

        <Tooltip
          formatter={(value: number) => [
            `${Number(value).toFixed(2)} kWh`,
            "Generation",
          ]}
        />

        <Bar
          dataKey="generation"
          fill="var(--solar)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
      </BarChart>
    )}
  </ResponsiveContainer>
</div>
        <div className="-mx-2 px-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">
  {tab === "daily"
    ? "Date"
    : tab === "monthly"
      ? "Month"
      : tab === "yearly"
        ? "Year"
        : "Year"}
</th>
                <th className="px-3 py-2">Generation</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.period} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    {tab === "daily" ? formatDate(row.period) : row.period}
                  </td>
                  <td className="num px-3 py-2.5">{row.generation.toFixed(2)} kWh</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search
                ? "No history entries match your search."
                : "No production data is available for this period."}
            </p>
          ) : null}
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)}{" "}
                of {filteredRows.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-border/70 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page === pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-border/70 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
                </>
      )}
    </Panel>
  );
}
