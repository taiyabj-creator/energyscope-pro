import { apiRequest } from "./client";

export async function getDailyEnergy(date?: string) {
  const endpoint = date
    ? `/charts/daily?date=${encodeURIComponent(date)}`
    : "/charts/daily";

  return apiRequest(endpoint);
}

export async function getMonthlyEnergy(month?: string) {
  const endpoint = month
    ? `/charts/monthly?month=${encodeURIComponent(month)}`
    : "/charts/monthly";

  return apiRequest(endpoint);
}

export async function getYearlyEnergy(year?: number) {
  const endpoint = year
    ? `/charts/yearly?year=${year}`
    : "/charts/yearly";

  return apiRequest(endpoint);
}

export async function getTotalEnergy() {
  return apiRequest("/charts/total");
}
