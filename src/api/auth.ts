import {
  apiRequest,
  setAuthToken,
  setDeviceId,
} from "./client";

export interface LoginResponse {
  success: boolean;
  token: string;
  expires_in?: number;
}

const DEVICE_ID = "hbeon_mobile";

export async function login(
  email: string,
  password: string
) {
  setDeviceId(DEVICE_ID);

  const data = await apiRequest<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        device_id: DEVICE_ID,
      }),
    }
  );

  if (!data.success) {
    throw new Error("Login failed");
  }

  setAuthToken(data.token);

  return data;
}