/**
 * UTL timestamps represent the last measurement upload, not logger connectivity.
 * Keep all timestamp parsing and presentation in one place so they cannot be
 * mistaken for a connection check.
 */
export function getDataAgeMinutes(timestamp: string, now = Date.now()): number | null {
  const measuredAt = new Date(timestamp.replace(" ", "T")).getTime();

  if (Number.isNaN(measuredAt)) return null;

  return Math.max(0, Math.floor((now - measuredAt) / 60_000));
}

export function formatMeasurementFreshness(timestamp?: string): string {
  if (!timestamp) return "Update time unavailable";

  const ageMinutes = getDataAgeMinutes(timestamp);
  if (ageMinutes === null) return "Update time unavailable";
  if (ageMinutes === 0) return "Updated just now";

  return `Updated ${ageMinutes} min ago`;
}
