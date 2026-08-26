import { apiRequest, setAuthToken, setDeviceId, setRememberMe, ApiError } from "./client";

export interface LoginResponse {
  success: boolean;
  token: string;
  expires_in?: number;
}

const DEVICE_ID = "hbeon_mobile";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  AUTH_SERVICE_ERROR: "Unable to sign in right now. Please try again later.",
  RATE_LIMITED: "Too many login attempts. Please try again later.",
};

export async function login(email: string, password: string, rememberMe: boolean) {
  setDeviceId(DEVICE_ID);
  setRememberMe(rememberMe);

  try {
    const data = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        rememberMe,
      }),
    });

    if (!data.success || !data.token) {
      throw new ApiError("AUTH_SERVICE_ERROR");
    }

    setAuthToken(data.token);

    return data;
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        LOGIN_ERROR_MESSAGES[err.code] ||
        "Unable to sign in right now. Please try again later.";
      throw new Error(message);
    }

    throw err;
  }
}
