import { apiRequest } from "./client";

export interface InverterInfo {
  model: string;
  serial: string;
  firmware: string;
  status: string;
}

export function getInverter() {
  return apiRequest<InverterInfo>("/inverter");
}
