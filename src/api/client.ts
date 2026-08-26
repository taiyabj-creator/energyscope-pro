const BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "/api";

let authToken: string | null = null;

if (typeof window !== "undefined") {
  authToken =
    localStorage.getItem("energyscope-token") ?? sessionStorage.getItem("energyscope-token");
}

let deviceId = "hbeon_mobile";
let rememberMe = true;

export function setAuthToken(token: string) {
  authToken = token;

  if (typeof window === "undefined") return;

  if (rememberMe) {
    localStorage.setItem("energyscope-token", token);
    sessionStorage.removeItem("energyscope-token");
  } else {
    sessionStorage.setItem("energyscope-token", token);
    localStorage.removeItem("energyscope-token");
  }
}

export function clearAuthToken() {
  authToken = null;

  if (typeof window === "undefined") return;

  localStorage.removeItem("energyscope-token");
  sessionStorage.removeItem("energyscope-token");
}

export function setDeviceId(id: string) {
  deviceId = id;
}

export function setRememberMe(enabled: boolean) {
  rememberMe = enabled;
}

export class ApiError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "ApiError";
    this.code = code;
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith("/api/")
    ? endpoint.slice(4)
    : endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;

  const response = await fetch(`${BASE_URL}${normalizedEndpoint}`, {
    ...options,

    headers: {
      "Content-Type": "application/json",

      ...(authToken
        ? {
            Authorization: `Bearer ${authToken}`,
          }
        : {}),

      "x-device-id": deviceId,

      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorCode = "AUTH_SERVICE_ERROR";

    try {
      const body = await response.json();

      if (body && typeof body.error === "string") {
        errorCode = body.error;
      }
    } catch {
      // Response was not JSON — keep default code.
    }

    throw new ApiError(errorCode);
  }

  return response.json();
}

export async function logoutRequest() {
  return apiRequest("/auth/logout", {
    method: "POST",
  });
}
