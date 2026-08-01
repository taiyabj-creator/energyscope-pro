import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Sun, Users } from "lucide-react";
import { Panel, PanelHeading } from "@/components/ui/primitives";
import { useEnergyTotals, usePlantInfo } from "@/hooks/useSolarData";
import { formatDate, formatEnergy, plantAge } from "@/utils/format";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Owner profile, plant summary and lifetime generation overview for the monitored UTL solar installation.",
      },
      { property: "og:title", content: "Profile — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Owner details and lifetime plant summary for your solar installation.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: plant } = usePlantInfo();
  const { data: totals } = useEnergyTotals();
  const age = plantAge(plant?.installationDate ?? new Date().toISOString());
  const lifetime = formatEnergy(totals?.total ?? 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Panel>
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-[image:var(--gradient-solar)] text-2xl font-semibold text-background">
            {(plant?.ownerName ?? "U").slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{plant?.ownerName ?? "—"}</p>
            <p className="truncate text-sm text-muted-foreground">System owner</p>
          </div>
        </div>
        <ul className="mt-6 space-y-3 text-sm">
          <li className="flex items-center gap-2 text-muted-foreground">
            <Sun className="size-4 shrink-0 text-solar" />
            <span className="min-w-0 truncate">
              {plant?.name ?? "—"} · {plant?.capacityKw ?? "—"} kW on-grid
            </span>
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{plant?.location ?? "—"}</span>
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              Monitoring since {plant ? formatDate(plant.installationDate) : "—"} · {age.label}
            </span>
          </li>
        </ul>
      </Panel>

      <Panel delay={0.05}>
        <PanelHeading title="Lifetime summary" subtitle="Cumulative results for this installation" />
        <div className="grid grid-cols-2 gap-5">
          <Big label="Lifetime generation" value={`${lifetime.value} ${lifetime.unit}`} />
          <Big label="This year" value={`${(totals?.year ?? 0).toFixed(0)} kWh`} />
          <Big label="This month" value={`${(totals?.month ?? 0).toFixed(0)} kWh`} />
          <Big label="Today" value={`${(totals?.today ?? 0).toFixed(2)} kWh`} />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          This dashboard is read-only and holds no account credentials — profile data comes from the
          plant record.
        </p>
      </Panel>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-1.5 text-xl font-semibold">{value}</p>
    </div>
  );
}
