import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, Gauge, Moon, Sun } from "lucide-react";
import { Panel, PanelHeading } from "@/components/ui/primitives";
import { useTheme } from "@/context/ThemeContext";
import { usePlantInfo } from "@/hooks/useSolarData";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useDashboardAuth } from "@/context/DashboardAuthContext";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import {
  disablePushNotifications,
  enablePushNotifications,
  fetchNotificationStatus,
  getExistingSubscription,
  getPushSupport,
} from "@/services/pushService";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — UTL Solar Dashboard" },
      {
        name: "description",
        content: "Useful display and export settings for UTL Solar monitoring.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { data: plant } = usePlantInfo();
  const { logout } = useDashboardAuth();
  const navigate = useNavigate();

  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  const pushSupport = getPushSupport();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushState, setPushState] = useState<{
    subscribedOnServer: number | null;
    hasLocalSubscription: boolean;
  }>({ subscribedOnServer: null, hasLocalSubscription: false });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await getExistingSubscription();
      let server: number | null = null;
      try {
        server = (await fetchNotificationStatus()).subscribed;
      } catch {
        server = null;
      }
      if (!cancelled) setPushState({ subscribedOnServer: server, hasLocalSubscription: !!local });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    if (!pushSupport.supported) return;

    if (pushSupport.permission !== "granted") {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }

    setPushBusy(true);
    try {
      await enablePushNotifications();
      const local = await getExistingSubscription();
      let server: number | null = null;
      try {
        server = (await fetchNotificationStatus()).subscribed;
      } catch {
        server = null;
      }
      setPushState({ subscribedOnServer: server, hasLocalSubscription: !!local });
    } finally {
      setPushBusy(false);
    }
  }

  async function disableNotifications() {
    setPushBusy(true);
    try {
      await disablePushNotifications();
      setPushState({ subscribedOnServer: 0, hasLocalSubscription: false });
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Panel>
        <PanelHeading title="Appearance" subtitle="Choose a comfortable monitoring theme" />
        <div className="flex flex-wrap gap-3">
          {(["dark", "light"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => option !== theme && toggle()}
              aria-pressed={theme === option}
              className={cn(
                "flex min-h-20 flex-1 items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                theme === option
                  ? "border-primary/50 bg-primary/8"
                  : "border-border/70 hover:bg-muted/50",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60">
                {option === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium capitalize">{option} theme</span>
                <span className="block text-xs text-muted-foreground">
                  {option === "dark" ? "Low-glare monitoring" : "Bright daylight viewing"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel delay={0.05}>
        <PanelHeading
          title="Refresh interval"
          subtitle="Live data polling is controlled centrally"
        />
        <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Gauge className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Every 60 seconds</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This interval matches the dashboard’s live-data policy. Connection status remains
              independent from the age of the latest measurement.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            🔔
          </span>

          <div className="flex-1">
            <p className="text-sm font-medium">Browser Notifications</p>

            <p className="mt-1 text-xs text-muted-foreground">
              {!pushSupport.supported
                ? "Status: Not supported on this device"
                : pushState.hasLocalSubscription && notificationPermission === "granted"
                  ? `Enabled · ${pushState.subscribedOnServer ?? "…"} device(s) registered`
                  : notificationPermission === "denied"
                    ? "Blocked"
                    : "Not enabled"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inverter online/offline alerts and the daily production summary are delivered even
              when the app is closed.
            </p>

            {pushSupport.supported && notificationPermission !== "granted" && (
              <button
                type="button"
                onClick={enableNotifications}
                disabled={pushBusy}
                className="mt-3 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium transition hover:bg-muted/50 disabled:opacity-50"
              >
                Enable Notifications
              </button>
            )}
            {pushSupport.supported &&
              notificationPermission === "granted" &&
              (!pushState.hasLocalSubscription || (pushState.subscribedOnServer ?? 0) === 0) && (
                <button
                  type="button"
                  onClick={enableNotifications}
                  disabled={pushBusy}
                  className="mt-3 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium transition hover:bg-muted/50 disabled:opacity-50"
                >
                  Re-enable Push
                </button>
              )}
            {pushSupport.supported &&
              notificationPermission === "granted" &&
              pushState.hasLocalSubscription && (
                <button
                  type="button"
                  onClick={disableNotifications}
                  disabled={pushBusy}
                  className="ml-2 mt-3 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/50 disabled:opacity-50"
                >
                  Disable
                </button>
              )}
          </div>
        </div>
      </Panel>

      <Panel delay={0.1}>
        <PanelHeading
          title="Exports & reports"
          subtitle="History exports use the values returned by UTL"
        />
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => window.open("/api/export/csv", "_blank")}
            className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 p-4 transition hover:bg-muted/40"
          >
            <div className="text-left">
              <p className="text-sm font-medium">Export CSV</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Export production history as a CSV spreadsheet.
              </p>
            </div>
            <Download className="size-5 text-solar" />
          </button>

          <button
            type="button"
            onClick={() => window.open("/api/export/excel", "_blank")}
            className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 p-4 transition hover:bg-muted/40"
          >
            <div className="text-left">
              <p className="text-sm font-medium">Export Excel (.xlsx)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Export formatted production data for Microsoft Excel.
              </p>
            </div>
            <Download className="size-5 text-solar" />
          </button>
        </div>
      </Panel>

      <Panel delay={0.15}>
        <PanelHeading
          title="Plant & support"
          subtitle="Backend-provided configuration and troubleshooting"
        />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Field label="Plant" value={plant?.name ?? "—"} />
          <Field label="Capacity" value={plant ? `${plant.capacityKw} kW` : "—"} />
          <Field label="Location" value={plant?.location ?? "—"} />
          <Field label="Saved layout" value="No custom layout saved" />
        </dl>
        <Link
          to="/diagnostics"
          className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open diagnostics
        </Link>
      </Panel>

      <Panel delay={0.2}>
        <PanelHeading title="Account" subtitle="Manage your dashboard session" />

        <button
          type="button"
          onClick={async () => {
            await logout();
            localStorage.removeItem("utl_token");
            navigate({ to: "/login" });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
        >
          <LogOut className="size-4" />
          Logout
        </button>
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
