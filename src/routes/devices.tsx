import { createFileRoute } from "@tanstack/react-router";
import { Cpu, Radio, Signal, Wifi } from "lucide-react";
import { Chip, Panel, PanelHeading, StatusDot } from "@/components/ui/primitives";
import { useInverter, useLogger, usePlantInfo } from "@/hooks/useSolarData";
import { formatDate } from "@/utils/format";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Devices — UTL Solar Dashboard" },
      {
        name: "description",
        content:
          "Plant information, inverter model, serial number, firmware, data logger, WiFi status, RSSI and last communication.",
      },
      { property: "og:title", content: "Devices — UTL Solar Dashboard" },
      {
        property: "og:description",
        content: "Inverter, logger and plant configuration details for your UTL solar system.",
      },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const { data: plant } = usePlantInfo();
  const { data: inverter } = useInverter();
  const { data: logger } = useLogger();

  const rssi = logger?.rssiDbm ?? -100;
  const rssiQuality = rssi > -60 ? "Excellent" : rssi > -70 ? "Good" : rssi > -80 ? "Fair" : "Weak";

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeading
          title="Plant information"
          subtitle="Configuration recorded for this installation"
        />
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Plant name" value={plant?.name ?? "—"} />
          <Item label="Owner" value={plant?.ownerName ?? "—"} />
          <Item label="Capacity" value={`${plant?.capacityKw ?? "—"} kW`} />
          <Item label="System type" value="On-grid (no battery)" />
          <Item label="Location" value={plant?.location ?? "—"} />
          <Item
            label="Coordinates"
            value={plant ? `${plant.latitude.toFixed(4)}, ${plant.longitude.toFixed(4)}` : "—"}
          />
          <Item label="Commissioned" value={plant ? formatDate(plant.installationDate) : "—"} />
          <Item label="Array tilt" value={`${plant?.tiltDegrees ?? "—"}°`} />
          <Item label="Orientation" value={plant?.azimuth ?? "—"} />
        </dl>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel delay={0.1}>
          <PanelHeading
            title="Inverter"
            subtitle="Primary power conversion unit"
            action={
              <Chip tone={inverter?.status === "online" ? "positive" : "warning"}>
                <StatusDot status={inverter?.status ?? "warning"} />
                {inverter?.status ?? "unknown"}
              </Chip>
            }
          />
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Cpu className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{inverter?.model ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                Serial {inverter?.serial ?? "—"}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Item label="Firmware" value={inverter?.firmware ?? "—"} />
            <Item label="Efficiency" value={`${inverter?.efficiencyPct ?? "—"} %`} />
            <Item label="AC voltage" value={`${inverter?.acVoltage.toFixed(1) ?? "—"} V`} />
            <Item label="AC frequency" value={`${inverter?.acFrequency.toFixed(2) ?? "—"} Hz`} />
            <Item label="DC voltage" value={`${inverter?.dcVoltage.toFixed(1) ?? "—"} V`} />
            <Item label="DC current" value={`${inverter?.dcCurrent.toFixed(1) ?? "—"} A`} />
            <Item label="Temperature" value={`${inverter?.temperatureC.toFixed(1) ?? "—"} °C`} />
            <Item label="Battery port" value="No battery installed" />
          </dl>
        </Panel>

        <Panel delay={0.15}>
          <PanelHeading
            title="Data logger"
            subtitle="Communication module reporting to the cloud"
            action={
              <Chip tone={logger?.status === "online" ? "positive" : "warning"}>
                <StatusDot status={logger?.status ?? "warning"} />
                {logger?.status ?? "unknown"}
              </Chip>
            }
          />
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-battery/12 text-battery">
              <Radio className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{logger?.model ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">Serial {logger?.serial ?? "—"}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Item label="Firmware" value={logger?.firmware ?? "—"} />
            <Item label="WiFi network" value={logger?.wifiSsid ?? "—"} icon={Wifi} />
            <Item label="Signal (RSSI)" value={`${rssi} dBm · ${rssiQuality}`} icon={Signal} />
            <Item label="Last communication" value={logger?.lastCommunication ?? "—"} />
          </dl>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-positive"
              style={{ width: `${Math.min(100, Math.max(0, 2 * (rssi + 100)))}%` }}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Item({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Wifi;
}) {
  return (
    <div className="min-w-0">
      <dt className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </dt>
      <dd className="num mt-1 truncate text-sm font-semibold">{value}</dd>
    </div>
  );
}
