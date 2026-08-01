const BASE_URL = import.meta.env.VITE_API_BASE_URL;

let authToken: string | null = null;
let deviceId: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function setDeviceId(id: string) {
  deviceId = id;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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
    throw new Error(
      `API Error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}