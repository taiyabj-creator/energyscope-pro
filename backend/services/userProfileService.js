/**
 * Live owner/account identity from the UTL Solar RMS portal.
 *
 * The dashboard previously carried a hardcoded owner name. The account itself
 * is the only authoritative source, so this service reads it from
 * `GET /user/profile` through the same authenticated `utlFetch` channel every
 * other upstream call uses.
 *
 * Only the fields the UI renders are returned. Permissions, `jwtInfo`, the
 * bearer token and any credential material are never copied out of the
 * upstream payload.
 */
const utlApi = require("./utlApi");

const PROFILE_URL = "https://utlsolarrms.com/api/user/profile";

// The portal profile changes rarely; a short cache keeps the dashboard from
// adding an upstream round-trip on every page navigation / refresh.
const CACHE_TTL_MS = 10 * 60 * 1000;

/** key (account email) -> { profile, at } */
const cache = new Map();

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The profile is wrapped differently across UTL deployments: plain `user`,
 * `data.user`, or the account object directly under `data`. Accept whichever
 * object is present rather than assuming one envelope.
 */
function pickUser(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [payload.user, payload.data?.user, payload.data];
  return (
    candidates.find(
      (candidate) =>
        candidate && typeof candidate === "object" && !Array.isArray(candidate),
    ) ?? null
  );
}

function sanitize(user) {
  if (!user) return null;

  const role = cleanText(user.role) ?? cleanText(user.role?.name);
  const business =
    cleanText(user.business) ??
    cleanText(user.business?.name) ??
    cleanText(user.business?.business_name);

  return {
    name: cleanText(user.name) ?? cleanText(user.full_name) ?? cleanText(user.fullName),
    email: cleanText(user.email),
    role,
    business,
  };
}

/**
 * Live profile with a last-known-good fallback.
 *
 * Never throws for a display-only lookup: a failed upstream call degrades to a
 * cached profile, and then to `null` fields, so the dashboard keeps rendering
 * instead of failing because the owner name is unavailable.
 */
async function getProfile(jwtToken, session) {
  const cacheKey = session?.email ?? "default";
  const cached = cache.get(cacheKey);
  const isFresh = cached && Date.now() - cached.at < CACHE_TTL_MS;

  if (isFresh) {
    return { ...cached.profile, source: "live" };
  }

  try {
    const response = await utlApi.utlFetch(jwtToken, session, PROFILE_URL, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`UTL profile returned HTTP ${response.status}.`);
    }

    const text = await response.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("UTL profile returned a non-JSON response.");
    }

    const profile = sanitize(pickUser(payload));

    if (!profile || !profile.name) {
      throw new Error("UTL profile did not include an account name.");
    }

    cache.set(cacheKey, { profile, at: Date.now() });

    return { ...profile, source: "live" };
  } catch (err) {
    console.error("[USER PROFILE] Live lookup failed:", err.message);

    if (cached) {
      return { ...cached.profile, source: "cache" };
    }

    return {
      name: null,
      email: session?.email ?? null,
      role: null,
      business: null,
      source: "unavailable",
    };
  }
}

module.exports = {
  getProfile,
};
