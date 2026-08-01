import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BatteryCharging, Bell, Moon, Sun } from "lucide-react";
import { Panel, PanelHeading } from "@/components/ui/primitives";
import { useTheme } from "@/context/ThemeContext";
import { usePlantInfo } from "@/hooks/useSolarData";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Appearance, plant configuration, battery readiness and notification preferences for the UTL Solar Dashboard.",
      },
      { property: "og:title", content: "Settings — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Theme, plant details, storage readiness and notification preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { data: plant } = usePlantInfo();
  const [prefs, setPrefs] = useState({
    anomaly: true,
    cleaning: true,
    inspection: true,
    offline: true,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel>
        <PanelHeading title="Appearance" subtitle="Dark theme is the default experience" />
        <div className="flex flex-wrap gap-3">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => t !== theme && toggle()}
              aria-pressed={theme === t}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                theme === t ? "border-primary/50 bg-primary/8" : "border-border/70 hover:bg-muted/50",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60">
                {t === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium capitalize">{t} theme</span>
                <span className="block text-xs text-muted-foreground">
                  {t === "dark" ? "Low-glare monitoring" : "Bright daylight viewing"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel delay={0.05}>
        <PanelHeading title="Notifications" subtitle="Advisory alerts only — never fabricated" />
        <ul className="space-y-3">
          {(
            [
              ["anomaly", "Performance anomaly alerts"],
              ["cleaning", "Cleaning reminders"],
              ["inspection", "Inspection reminders"],
              ["offline", "Offline / data gap warnings"],
            ] as const
          ).map(([key, label]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3"
            >
              <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                <Bell className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                aria-label={label}
                onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  prefs[key] ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-card shadow transition-all",
                    prefs[key] ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel delay={0.1}>
        <PanelHeading title="Plant configuration" subtitle="Values used across the dashboard" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Field label="Plant name" value={plant?.name ?? "—"} />
          <Field label="Capacity" value={`${plant?.capacityKw ?? "—"} kW`} />
          <Field label="System type" value="On-grid" />
          <Field label="Location" value={plant?.location ?? "—"} />
          <Field label="Installation date" value={plant?.installationDate ?? "—"} />
          <Field label="Tilt / azimuth" value={`${plant?.tiltDegrees ?? "—"}° · ${plant?.azimuth ?? ""}`} />
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">
          These fields become editable once the plant configuration API is connected.
        </p>
      </Panel>

      <Panel delay={0.15}>
        <PanelHeading title="Energy storage" subtitle="Battery support is built in and dormant" />
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border/80 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
            <BatteryCharging className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">No battery installed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Battery state of charge, storage flow and charge/discharge widgets stay hidden. They
              appear automatically across the dashboard when a battery is reported by the system.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="num mt-1 truncate font-semibold">{value}</dd>
    </div>
  );
}
