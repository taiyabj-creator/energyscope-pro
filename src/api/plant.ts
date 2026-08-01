import { apiRequest } from "./client";

export function getPlants() {
  return apiRequest("/plant");
}

export function getPlantDashboard(plantId: number) {
  return apiRequest(`/plantdashboard?id=${plantId}`);
}

export function getPlantStatus() {
  return apiRequest("/plantStatus");
}