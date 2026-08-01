import { apiRequest } from "./client";

export interface InverterInfo {
  model: string;
  serial: string;
  firmware: string;
  status: string;
}

export async function getInverter(
  plantId: number
) {
  return apiRequest<InverterInfo>(
    `/plants/${plantId}/inverter`
  );
}

export async function getLogger(
  plantId: number
) {
  return apiRequest(
    `/plants/${plantId}/logger`
  );
}