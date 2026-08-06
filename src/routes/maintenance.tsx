import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck, Droplets, HeartPulse, Wrench } from "lucide-react";
import { MetricCard } from "@/components/cards/MetricCard";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import {
  useMaintenance,
  usePlantInfo,
  useUpdateMaintenance,
} from "@/hooks/useSolarData";
import { formatDate, plantAge } from "@/utils/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Plant age, cleaning and inspection records, maintenance timeline and the weather-adjusted plant health score.",
      },
      { property: "og:title", content: "Maintenance — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Cleaning, inspection history and plant health score for your solar system.",
      },
    ],
  }),
  component: MaintenancePage,
});

        const typeStyle = {
       cleaning: "bg-primary/12 text-primary",
       inspection: "bg-warning/12 text-warning",
       repair: "bg-destructive/12 text-destructive",
       installation: "bg-positive/12 text-positive",
        } as const;

      function MaintenancePage() {
       const { data } = useMaintenance();
      const updateMaintenance = useUpdateMaintenance();

        const { data: plant } = usePlantInfo();

       const [cleaningDate, setCleaningDate] = useState("");
       const [inspectionDate, setInspectionDate] = useState("");

       const age = plantAge(plant?.installationDate ?? new Date().toISOString());

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Plant age"
          value={age.label}
          icon={CalendarCheck}
          footnote={plant ? `Commissioned ${formatDate(plant.installationDate)}` : ""}
        />
        <MetricCard
            title="Last cleaning"
             value={data ? formatDate(data.lastCleaning, { day: "2-digit", month: "short" }) : "—"}
             icon={Droplets}
             tone="load"
             footnote={
              data
              ? `Next: ${formatDate(data.nextCleaning)} (${data.cleaningDueIn >= 0 ? `${data.cleaningDueIn} days left` : `${Math.abs(data.cleaningDueIn)} days overdue`})`
             : "Loading..."
             }
        />
        <MetricCard
           title="Last inspection"
           value={data ? formatDate(data.lastInspection, { day: "2-digit", month: "short" }) : "—"}
           icon={Wrench}
          tone="grid"
           footnote={
            data
           ? `Next: ${formatDate(data.nextInspection)} (${data.inspectionDueIn >= 0 ? `${data.inspectionDueIn} days left` : `${Math.abs(data.inspectionDueIn)} days overdue`})`
           : "Loading..."
           }
        />
        <MetricCard
          title="Plant health score"
          value={String(data?.healthScore ?? "—")}
          unit="/100"
          icon={HeartPulse}
          tone="battery"
          footnote="Weather-adjusted, advisory only"
        />
      </div>
       
             <Panel delay={0.05}>
        <PanelHeading
          title="Maintenance Records"
          subtitle="Update service dates"
        />

        <div className="space-y-6">

          <div>
            <label className="mb-2 block text-sm font-medium">
              Last Cleaning
            </label>

            <div className="flex gap-3">
              <input
                type="date"
                value={cleaningDate}
                onChange={(e) => setCleaningDate(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2"
              />

              <button
                type="button"
                onClick={() =>
                  updateMaintenance.mutate({
                    lastCleaning: cleaningDate,
                  })
                }
                className="rounded-xl bg-primary px-4 py-2 text-primary-foreground"
              >
                Save
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Last Inspection
            </label>

            <div className="flex gap-3">
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2"
              />

              <button
                type="button"
                onClick={() =>
                  updateMaintenance.mutate({
                    lastInspection: inspectionDate,
                  })
                }
                className="rounded-xl bg-primary px-4 py-2 text-primary-foreground"
              >
                Save
              </button>
            </div>
          </div>

        </div>
      </Panel>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Panel delay={0.1}>
          <PanelHeading title="Health score breakdown" subtitle="Weighted factors behind the score" />
          {!data ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ul className="space-y-4">
              {data.healthFactors.map((f) => (
                <li key={f.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{f.label}</span>
                    <span className="num shrink-0 font-semibold">{f.score}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[image:var(--gradient-solar)]"
                      style={{ width: `${f.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Weight {f.weightPct}%</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel delay={0.15}>
          <PanelHeading title="Maintenance timeline" subtitle="Recorded service history" />
          {!data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ol className="relative space-y-6 pl-6">
              <span className="absolute left-[9px] top-1 h-[calc(100%-0.5rem)] w-px bg-border" />
              {data.timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-6 top-0.5 grid size-[19px] place-items-center rounded-full border border-border bg-card",
                    )}
                  >
                    <span
                      className={cn("size-2.5 rounded-full", typeStyle[e.type].split(" ")[0])}
                    />
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <p className="min-w-0 truncate text-sm font-medium">{e.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        typeStyle[e.type],
                      )}
                    >
                      {e.type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(e.date)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
