import { apiRequest } from "./client";

export interface Plant {
  id: number;
  name: string;
  capacity?: number;
  location?: string;
  last_update?: string;
  creation_date?: string;
  on_grid_status?: string;
}

export function getPlants() {
  return apiRequest<Plant[]>("/plant");
}

export function getPlantStatus() {
  return apiRequest("/plantStatus");
}
