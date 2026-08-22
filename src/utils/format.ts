export function formatPower(watts: number) {
  if (Math.abs(watts) >= 1000) return { value: (watts / 1000).toFixed(2), unit: "kW" };
  return { value: Math.round(watts).toString(), unit: "W" };
}

export function formatEnergy(kwh: number) {
  if (Math.abs(kwh) >= 1000) return { value: (kwh / 1000).toFixed(2), unit: "MWh" };
  return { value: kwh.toFixed(kwh < 100 ? 2 : 1), unit: "kWh" };
}

/**
 * Percentage change versus the previous period. Returns null when the
 * comparison cannot be expressed honestly: no historical value, or a previous
 * value of zero while current production exists (percentage undefined).
 * A genuine zero-to-zero comparison returns 0, where "flat" is correct.
 */
export function trendPct(current: number, previous: number | null): number | null {
  if (previous === null || previous < 0) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString(
    "en-GB",
    opts ?? { day: "2-digit", month: "short", year: "numeric" },
  );
}

export function plantAge(iso: string) {
  const start = new Date(iso);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, label: `${years}y ${months}m` };
}

export function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h]!)).join(","))].join(
    "\n",
  );
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
