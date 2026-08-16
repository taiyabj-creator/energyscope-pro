import {
  apiRequest,
  setAuthToken,
  setDeviceId,
  setRememberMe,
} from "./client";

export interface LoginResponse {
  success: boolean;
  token: string;
  expires_in?: number;
}

const DEVICE_ID = "hbeon_mobile";

export async function login(
  email: string,
  password: string,
  rememberMe: boolean
) {
  setDeviceId(DEVICE_ID);
  setRememberMe(rememberMe);

  const data = await apiRequest<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        rememberMe,
      }),
    }
  );

  if (!data.success || !data.token) {
    throw new Error("Login failed");
  }

  setAuthToken(data.token);

  return data;
}
