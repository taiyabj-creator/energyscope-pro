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

function normalizeEndpoint(endpoint: string) {
  return endpoint.startsWith("/api/")
    ? endpoint.slice(4)
    : endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;
}

/**
 * The single place request headers are assembled. Both `apiRequest` and
 * `apiBlob` go through it, so authenticated binary downloads (exports) are
 * guaranteed to carry exactly the same credentials as every other API call -
 * there is no second, weaker auth path.
 */
function buildHeaders(options: RequestInit): Record<string, string> {
  return {
    "Content-Type": "application/json",

    ...(authToken
      ? {
          Authorization: `Bearer ${authToken}`,
        }
      : {}),

    "x-device-id": deviceId,

    ...((options.headers as Record<string, string>) || {}),
  };
}

async function readErrorCode(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();

    if (body && typeof body.error === "string") {
      return body.error;
    }

    if (body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // Response was not JSON — keep the caller's fallback.
  }

  return fallback;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${normalizeEndpoint(endpoint)}`, {
    ...options,

    headers: buildHeaders(options),
  });

  if (!response.ok) {
    throw new ApiError(await readErrorCode(response, "AUTH_SERVICE_ERROR"));
  }

  return response.json();
}

export interface ApiBlobResponse {
  blob: Blob;
  /** Server-chosen download name from Content-Disposition, when present. */
  filename: string | null;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]!.trim());
    } catch {
      // Fall through to the plain form.
    }
  }

  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1]!.trim() : null;
}

/**
 * Authenticated download of a binary/text body (CSV, XLSX, PDF).
 *
 * `apiRequest` cannot be reused for this: it hardcodes a JSON content type and
 * always parses the response as JSON. This shares the identical header builder,
 * so auth stays exactly as strict as every other API call - nothing is weakened
 * and no endpoint is made public.
 */
export async function apiBlob(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiBlobResponse> {
  const response = await fetch(`${BASE_URL}${normalizeEndpoint(endpoint)}`, {
    ...options,

    headers: buildHeaders(options),
  });

  if (!response.ok) {
    throw new ApiError(
      await readErrorCode(
        response,
        response.status === 401
          ? "Authentication required"
          : "The server could not complete the request.",
      ),
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition")),
  };
}

export async function logoutRequest() {
  return apiRequest("/auth/logout", {
    method: "POST",
  });
}
