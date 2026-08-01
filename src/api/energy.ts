const BASE_URL = "http://localhost:3000/api/charts";

export async function getDailyEnergy() {
  const response = await fetch(`${BASE_URL}/daily`);

  if (!response.ok) {
    throw new Error("Failed to fetch daily chart.");
  }

  return response.json();
}

export async function getMonthlyEnergy() {
  const response = await fetch(`${BASE_URL}/monthly`);

  if (!response.ok) {
    throw new Error("Failed to fetch monthly chart.");
  }

  return response.json();
}

export async function getYearlyEnergy() {
  const response = await fetch(`${BASE_URL}/yearly`);

  if (!response.ok) {
    throw new Error("Failed to fetch yearly chart.");
  }

  return response.json();
}

export async function getTotalEnergy() {
  const response = await fetch(`${BASE_URL}/total`);

  if (!response.ok) {
    throw new Error("Failed to fetch total chart.");
  }

  return response.json();
}