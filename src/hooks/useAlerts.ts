import { useInverter, useLogger, useEnergyTotals } from "./useSolarData";

export function useAlerts() {
  const inverter = useInverter();
  const logger = useLogger();
  const totals = useEnergyTotals();

  const alerts: {
    id: string;
    severity: "error" | "warning";
    title: string;
    description: string;
  }[] = [];

  if (logger.data && logger.data.status !== "online") {
    alerts.push({
      id: "logger-offline",
      severity: "error",
      title: "Logger Offline",
      description: "The logger is currently unreachable.",
    });
  }

  if (inverter.data && inverter.data.status === "warning" && (totals.data?.today ?? 0) === 0) {
    alerts.push({
      id: "inverter-offline",
      severity: "error",
      title: "Inverter Offline",
      description: "The inverter is not producing power.",
    });
  }

  // Low generation alert removed - misleading during early day hours as production ramps up

  return {
    alerts,
    count: alerts.length,
  };
}
