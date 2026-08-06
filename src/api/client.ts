

const BASE_URL = import.meta.env["VITE_API_BASE_URL"];
console.log("BASE_URL =", BASE_URL);

let authToken: string | null = null;

if (typeof window !== "undefined") {
  authToken =
    localStorage.getItem("energyscope-token") ??
    sessionStorage.getItem("energyscope-token");
}

let deviceId: string | null = null;

let rememberMe = true;


export function setAuthToken(token: string) {
  authToken = token;

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

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,

    headers: {
      "Content-Type": "application/json",

      ...(authToken && {
        Authorization: `Bearer ${authToken}`,
      }),

      ...(deviceId && {
        "x-device-id": deviceId,
      }),

      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
