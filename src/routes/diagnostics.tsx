import { createFileRoute } from "@tanstack/react-router";
import { Activity, Clock3, Radio, Server } from "lucide-react";
import { Chip, Panel, PanelHeading, StatusDot } from "@/components/ui/primitives";
import { useLivePower, useLogger } from "@/hooks/useSolarData";
import { formatMeasurementFreshness } from "@/utils/measurementFreshness";

export const Route = createFileRoute("/diagnostics")({
  head: () => ({
    meta: [
      { title: "Diagnostics — UTL Solar Dashboard" },
      {
        name: "description",
        content: "Connection and environment details for UTL Solar troubleshooting.",
      },
    ],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const live = useLivePower();
  const { data: logger } = useLogger();
  const backendState = live.isError ? "Unavailable" : live.data ? "Connected" : "Checking";
  const browser = typeof navigator === "undefined" ? "Not available" : navigator.userAgent;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Not available";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={Server}
          label="Backend status"
          value={backendState}
          detail={live.isError ? "Latest live-data request failed" : "Live-data request status"}
          tone={live.isError ? "warning" : live.data ? "positive" : "default"}
        />
        <StatusCard
          icon={Radio}
          label="Logger"
          value={
            logger?.status === "online"
              ? "Online"
              : logger?.status === "offline"
                ? "Offline"
                : "Checking"
          }
          detail={formatMeasurementFreshness(logger?.lastCommunication)}
          tone={
            logger?.status === "online"
              ? "positive"
              : logger?.status === "offline"
                ? "warning"
                : "default"
          }
        />
        <StatusCard
          icon={Clock3}
          label="Refresh policy"
          value="60 seconds"
          detail="Frontend live-data polling interval"
          tone="default"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeading
            title="Request health"
            subtitle="Observed by the frontend during this session"
          />
          <dl className="space-y-3">
            <Row
              label="Last successful backend request"
              value={formatTimestamp(live.dataUpdatedAt)}
            />
            <Row label="Last failed request" value={formatTimestamp(live.errorUpdatedAt)} />
            <Row label="API response latency" value="Not provided" />
            <Row label="Backend version" value="V1.0.0" />
            <Row
              label="Latest request state"
              value={live.fetchStatus === "fetching" ? "Refreshing" : "Idle"}
            />
          </dl>
          <p className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            The backend currently does not expose version or request-timing metadata, so those
            values are deliberately not estimated.
          </p>
        </Panel>

        <Panel delay={0.05}>
          <PanelHeading title="Environment" subtitle="Useful context when reporting an issue" />
          <dl className="space-y-3">
            <Row
              label="Frontend version"
              value={import.meta.env["VITE_APP_VERSION"] ?? "V1.0.0"}
            />
            <Row label="Timezone" value={timezone} />
            <Row label="Browser" value={browser} />
            <Row
              label="Latest measurement age"
              value={formatMeasurementFreshness(logger?.lastCommunication)}
            />
            <Row
            label="Logger status"
             value={
            logger
            ? logger.status === "online"
             ? "Online"
           : "Offline"
            : "Unavailable"
             }
              />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "default" | "positive" | "warning";
}) {
  const status = tone === "positive" ? "online" : tone === "warning" ? "warning" : "warning";
  return (
    <Panel className="min-h-36" solid>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <Chip tone={tone}>
          <StatusDot status={status} /> {value}
        </Chip>
      </div>
      <p className="mt-4 text-sm font-medium">{label}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-xs font-medium">{value}</dd>
    </div>
  );
}

function formatTimestamp(timestamp: number) {
  return timestamp > 0
    ? new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
    : "No request recorded";
}
