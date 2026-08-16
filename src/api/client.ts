const BASE_URL = "/api";

let authToken: string | null = null;

if (typeof window !== "undefined") {
  authToken =
    localStorage.getItem("energyscope-token") ??
    sessionStorage.getItem("energyscope-token");
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

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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
    const text = await response.text();

    throw new Error(
      `API Error ${response.status}: ${text || response.statusText}`
    );
  }

  return response.json();
}

export async function logoutRequest() {
  return apiRequest("/auth/logout", {
    method: "POST",
  });
}
