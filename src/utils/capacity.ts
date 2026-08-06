/** Returns AC output as a rounded percentage of the configured installed capacity. */
export function getCapacityPercentage(powerWatts: number, capacityKw?: number): number | null {
  if (!Number.isFinite(powerWatts) || !capacityKw || capacityKw <= 0) return null;

  return Math.round((powerWatts / (capacityKw * 1000)) * 100);
}
