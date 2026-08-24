/**
 * EnergyScope background notification monitor.
 *
 * Hosted INSIDE the existing long-running backend process (server.js) -
 * no second server. Reuses the existing stack end-to-end:
 *
 *  - UTL access: archiveCollector.ensureCollectorSession() (the shared
 *    "__collector__" session, pythonAdapter login, sessionService storage,
 *    utlApi.utlFetch auto-refresh on 401). No new authentication mechanism.
 *  - Inverter online/offline: utlApi.getPlantStatus() -> data.online /
 *    data.offline / data.partiallyOffline plantIds (the SAME source the
 *    dashboard's logger status uses).
 *  - Solar day close: weatherService.getWeather(lat, lon).sunset (open-meteo,
 *    the same service prediction.js uses) + 1 hour, Asia/Kolkata. If the
 *    weather service is unreachable the sunset is computed astronomically
 *    from the plant coordinates (NOAA algorithm), so a third-party outage
 *    can never silently suppress the daily summary.
 *  - Daily energy: trapezoidal integration of the charts/daily WATT curve
 *    via archiveCollector.integratePowerCurveWh() -> Wh/1000 = kWh. If
 *    today's authoritative archive row already exists it is preferred
 *    verbatim. Values are NEVER multiplied by 1000.
 *
 * NOTIFICATION RULES
 *
 * online : only on confirmed OFFLINE -> ONLINE transition.
 * offline: only on confirmed ONLINE -> OFFLINE transition, and ONLY after
 *          OFFLINE_CONFIRMATIONS consecutive polls with the plant absent
 *          from all producing lists. A single network/API error NEVER flips
 *          state to offline.
 * UNKNOWN (startup) never triggers a notification in either direction.
 * partiallyOffline counts as ONLINE (still producing).
 *
 * DAILY SUMMARY: one per plant per calendar day (Asia/Kolkata), persisted in
 * notifications.db BEFORE sending (claim-first), so restarts cannot double-
 * send. At-most-once semantics by design.
 */

const collector = require("./archiveCollector");
const utlApi = require("./utlApi");
const archiveService = require("./archiveService");
const weatherService = require("./weatherService");
const pushService = require("./pushService");

const UTL_BASE = "https://utlsolarrms.com/api";

// Polling cadence of the monitor itself (independent from dashboard polling).
const DEFAULT_POLL_MS = Number(process.env.NOTIFY_POLL_INTERVAL_MS || 5 * 60 * 1000);
// Consecutive "absent from producing lists" observations before OFFLINE.
const DEFAULT_OFFLINE_CONFIRMATIONS = Number(process.env.OFFLINE_CONFIRMATIONS || 3);
// Plant coordinates follow the existing project convention (prediction.js).
const LAT = Number(process.env.PLANT_LATITUDE || 22.5736);
const LON = Number(process.env.PLANT_LONGITUDE || 88.3639);

const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function log(...args) {
  console.log("[NOTIFY]", ...args);
}

function istTimeString(instant) {
  return IST_TIME_FORMATTER.format(instant instanceof Date ? instant : new Date(instant));
}

const DEG = Math.PI / 180;

/**
 * Astronomical sunset (UTC Date) for a calendar date + coordinates, using the
 * standard NOAA algorithm. Fallback ONLY for scheduling the daily summary
 * when the weather service is unavailable - never used for production data.
 */
function computeSunsetUtc(dateStr, latDeg, lonDeg) {
  const parts = String(dateStr).split("-").map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) {
    throw new Error(`invalid date '${dateStr}'`);
  }
  const [y, m, d] = parts;
  const jdMidnightUtc = Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;
  const n = Math.round(jdMidnightUtc - 2451545.0);
  const jStar = n - lonDeg / 360;
  const meanAnomaly = (357.5291 + 0.98560028 * jStar) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * DEG) +
    0.02 * Math.sin(2 * meanAnomaly * DEG) +
    0.0003 * Math.sin(3 * meanAnomaly * DEG);
  const eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
  const jTransit =
    jStar + 0.0053 * Math.sin(meanAnomaly * DEG) - 0.0069 * Math.sin(2 * eclipticLon * DEG);
  const declination = Math.asin(Math.sin(eclipticLon * DEG) * Math.sin(23.4397 * DEG));
  const cosOmega =
    (Math.sin(-0.833 * DEG) - Math.sin(latDeg * DEG) * Math.sin(declination)) /
    (Math.cos(latDeg * DEG) * Math.cos(declination));
  if (cosOmega > 1 || cosOmega < -1) {
    throw new Error("sun never sets/rises at this latitude on this date");
  }
  // jSet counts days since J2000.0 -> convert to Unix epoch milliseconds
  // via J2000 = JD 2451545.0 = 1970-01-01.5 UTC.
  const jSet = jTransit + Math.acos(cosOmega) / (2 * Math.PI);
  return new Date(Math.round((jSet + 2451545.0 - 2440587.5) * 86400000));
}

function getState(db, key) {
  const row = db.prepare("SELECT value FROM notification_state WHERE key = ?").get(key);
  return row?.value ?? null;
}

function setState(db, key, value) {
  db.prepare(
    `INSERT INTO notification_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, Date.now());
}

async function fetchPlantStatus(session, deps = {}) {
  const api = deps.utlApi || utlApi;
  const json = await api.getPlantStatus(collector.COLLECTOR_SESSION_KEY, session);
  return {
    online: (json?.data?.online?.plantIds ?? []).map(String),
    partiallyOnline: (json?.data?.partiallyOnline?.plantIds ?? []).map(String),
    offline: (json?.data?.offline?.plantIds ?? []).map(String),
    partiallyOffline: (json?.data?.partiallyOffline?.plantIds ?? []).map(String),
  };
}

async function fetchDailyCurve(dateStr, session, deps = {}) {
  const api = deps.utlApi || utlApi;
  const response = await api.utlFetch(
    collector.COLLECTOR_SESSION_KEY,
    session,
    `${UTL_BASE}/charts/solar_power_per_plant/daily`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plant_id: Number(archiveService.PLANT_ID()),
        date_parameter: dateStr,
      }),
    },
  );
  return JSON.parse(await response.text());
}

/**
 * Peak instantaneous power from the daily curve.
 * Samples are WATTS at `timeMinutes` past IST midnight.
 * Ties resolved to the EARLIEST occurrence. Returns null when no valid sample.
 */
function computePeak(curveResults) {
  if (!Array.isArray(curveResults)) return null;
  let best = null;
  for (const r of curveResults) {
    const t = Number(r?.timeMinutes);
    const p = Number(r?.PvProduction);
    if (!Number.isFinite(t) || !Number.isFinite(p)) continue;
    if (best === null || p > best.watts) best = { watts: p, timeMinutes: t };
  }
  if (best === null || best.watts <= 0) return null;
  // timeMinutes is minutes past Asia/Kolkata midnight; render directly as
  // IST wall-clock in 12-hour form (no Date/timezone round-trip needed).
  const h24 = Math.floor(best.timeMinutes / 60);
  const mins = Math.round(best.timeMinutes % 60);
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    kw: best.watts / 1000, // W -> kW
    timeLabel: `${h12}:${String(mins).padStart(2, "0")} ${ampm}`,
  };
}

/**
 * Rank of todayKwh among all recorded days INCLUDING today.
 * #1 = highest generation. Standard competition ranking:
 * rank = 1 + count(strictly greater recorded values); ties share a rank.
 * Returns null when there is not enough history (< 2 days incl. today).
 */
function computeRank(todayKwh, archivedRows) {
  if (!Number.isFinite(todayKwh)) return null;
  const others = (archivedRows || [])
    .map((r) => Number(r.generation_kwh))
    .filter((v) => Number.isFinite(v));
  if (others.length + 1 < 2) return null;
  return 1 + others.filter((v) => v > todayKwh + 1e-9).length;
}

/** Build the three-paragraph daily summary body. */
function buildSummaryBody({ todayKwh, rank, peak }) {
  const lines = [];
  lines.push(
    Number.isFinite(todayKwh)
      ? `Today's generation: ${todayKwh.toFixed(2)} kWh.`
      : "Today's generation data was unavailable.",
  );
  lines.push(
    rank === null
      ? "Production rank: Not enough historical data yet."
      : `Today's production ranked #${rank} among all recorded production days.`,
  );
  lines.push(
    peak
      ? `Today's peak power: ${peak.kw.toFixed(2)} kW at ${peak.timeLabel}.`
      : "Peak power data was unavailable today.",
  );
  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

function createMonitor(overrides = {}) {
  const deps = {
    db: overrides.db || require("../data/notificationDatabase"),
    push: overrides.push || pushService,
    utlApi: overrides.utlApi || utlApi,
    weather: overrides.weather || weatherService,
    collector: overrides.collector || collector,
    archive: overrides.archive || archiveService,
    pollMs: overrides.pollMs || DEFAULT_POLL_MS,
    offlineConfirmations: overrides.offlineConfirmations || DEFAULT_OFFLINE_CONFIRMATIONS,
    lat: Number(overrides.lat ?? LAT),
    lon: Number(overrides.lon ?? LON),
    now: overrides.now || (() => new Date()),
    sendPush: null, // resolved below
  };
  // sendPush is overridable for tests; default broadcasts to all subscriptions.
  deps.sendPush =
    typeof overrides.sendPush === "function"
      ? overrides.sendPush
      : (payload) => deps.push.broadcast(payload);

  let timer = null;
  let running = false;

  async function observeInverter() {
    const db = deps.db;
    const plantId = deps.archive.PLANT_ID();

    let session;
    try {
      session = await deps.collector.ensureCollectorSession();
    } catch (err) {
      log(`Auth unavailable, keeping previous state: ${err.message}`);
      return;
    }

    let ids;
    try {
      ids = await fetchPlantStatus(session, { utlApi: deps.utlApi });
    } catch (err) {
      // Transient API/network failure: NEVER treated as inverter offline.
      log(`Status poll failed (transient?): ${err.message}`);
      return;
    }

    const producing =
      ids.online.includes(plantId) ||
      ids.partiallyOnline.includes(plantId) ||
      ids.partiallyOffline.includes(plantId);

    const prevRaw = getState(db, "inverter_state"); // ONLINE | OFFLINE | other
    const prev = prevRaw === "ONLINE" || prevRaw === "OFFLINE" ? prevRaw : "UNKNOWN";

    if (producing) {
      setState(db, "inverter_state", "ONLINE");
      setState(db, "offline_streak", "0");
      if (prev === "OFFLINE") {
        log("Transition OFFLINE -> ONLINE: notifying.");
        await deps.sendPush({
          kind: "inverter_online",
          title: "EnergyScope — Inverter Online",
          body: `${process.env.NOTIFY_PLANT_NAME || "The plant"} inverter is back online and producing power. Transition detected at ${istTimeString(deps.now())}.`,
          url: "/",
        });
      } else {
        log(`Inverter ONLINE (no transition from ${prev}).`);
      }
      return;
    }

    if (ids.offline.includes(plantId)) {
      const streak = Number(getState(db, "offline_streak") || "0") + 1;
      setState(db, "offline_streak", String(streak));

      if (streak >= deps.offlineConfirmations && prev !== "OFFLINE") {
        setState(db, "inverter_state", "OFFLINE");
        log(`Transition ${prev} -> OFFLINE after ${streak} confirmations: notifying.`);
        await deps.sendPush({
          kind: "inverter_offline",
          title: "EnergyScope — Inverter Offline",
          body: `${process.env.NOTIFY_PLANT_NAME || "The plant"} inverter went offline at ${istTimeString(deps.now())}. EnergyScope will continue monitoring its status.`,
          url: "/diagnostics",
        });
      } else {
        log(`Offline candidate (streak ${streak}/${deps.offlineConfirmations}, state ${prev}).`);
      }
      return;
    }

    // Plant absent from every list this round: ambiguous upstream lag; no change.
    log("Plant absent from all status lists; no state change.");
  }

  /** Sunset instant (Date) for the current IST calendar day. */
  async function getTodaySunset() {
    const todayIst = deps.archive.istDateString(deps.now());
    const cached = getState(deps.db, `sunset_${todayIst}`);
    if (cached) return new Date(Number(cached));

    let sunset;
    try {
      const weather = await deps.weather.getWeather(deps.lat, deps.lon);
      if (!weather?.sunset) throw new Error("no sunset field in response");
      sunset = new Date(weather.sunset); // open-meteo returns ISO with offset
      if (Number.isNaN(sunset.getTime())) throw new Error("invalid sunset value");
      log(`Sunset for ${todayIst}: ${istTimeString(sunset)} IST (weather service).`);
    } catch (err) {
      // A third-party outage must never suppress the daily summary: fall back
      // to astronomical computation from the plant coordinates.
      try {
        sunset = computeSunsetUtc(todayIst, deps.lat, deps.lon);
        log(
          `WARN Weather unavailable (${err.message}); using computed sunset ${istTimeString(sunset)} IST.`,
        );
      } catch (astroErr) {
        throw new Error(`Sunset unavailable: weather=${err.message}; astro=${astroErr.message}`);
      }
    }

    // Cache per IST day so we query at most once per day.
    setState(deps.db, `sunset_${todayIst}`, String(sunset.getTime()));
    return sunset;
  }

  /**
   * Daily energy for the current IST day, in kWh:
   *  - prefer today's authoritative archive row when present;
   *  - otherwise integrate today's live WATT curve (Wh/1000) WITHOUT writing
   *    to the archive (the 06:00 collector remains the archival authority).
   * Returns {kwh, peak} or null when nothing usable exists.
   */
  async function buildDailyFigures(todayIst, session) {
    let kwh = null;
    let curveResults = null;

    const archiveRow = deps.archive
      .getDailyRecords({ date: todayIst })
      .find((r) => String(r.plant_id) === String(deps.archive.PLANT_ID()));
    if (archiveRow && Number.isFinite(Number(archiveRow.generation_kwh))) {
      kwh = Number(archiveRow.generation_kwh);
    }

    try {
      const curveJson = await fetchDailyCurve(todayIst, session, { utlApi: deps.utlApi });
      curveResults = Array.isArray(curveJson?.results) ? curveJson.results : null;
      if (curveResults && kwh === null) {
        const integration = deps.collector.integratePowerCurveWh(curveResults);
        if (integration && integration.pointsCount > 0) {
          kwh = integration.wattHours / 1000; // Wh -> kWh
        }
      }
    } catch (err) {
      log(`Daily curve unavailable for summary (${err.message}).`);
    }

    if (kwh === null && curveResults === null) return null;
    return { kwh, peak: computePeak(curveResults) };
  }

  async function maybeSendDailySummary() {
    const db = deps.db;
    const now = deps.now();
    const todayIst = deps.archive.istDateString(now);

    // Already sent today? Idempotency ledger is the single gate.
    const already = db
      .prepare("SELECT 1 FROM daily_summary_sent WHERE plant_id = ? AND generation_date = ?")
      .get(deps.archive.PLANT_ID(), todayIst);
    if (already) return;

    // Determine production close = sunset + 1h.
    let closeAt;
    try {
      const sunset = await getTodaySunset();
      closeAt = new Date(sunset.getTime() + 60 * 60 * 1000);
    } catch (err) {
      log(`Cannot determine sunset yet: ${err.message}`);
      return;
    }

    if (now.getTime() < closeAt.getTime()) {
      log(
        `Production not closed yet (closes ${closeAt.toISOString()}, ~${istTimeString(closeAt)} IST).`,
      );
      return;
    }

    let session;
    try {
      session = await deps.collector.ensureCollectorSession();
    } catch (err) {
      log(`Summary skipped, auth unavailable: ${err.message}`);
      return;
    }

    const figures = await buildDailyFigures(todayIst, session);
    if (!figures) {
      log("No usable data for daily summary; will retry next tick.");
      return;
    }

    const archivedRows = deps.archive
      .getDailyRecords({})
      .filter((r) => r.generation_date !== todayIst);
    const rank = computeRank(figures.kwh ?? NaN, archivedRows);

    // Claim FIRST (idempotency), then send. A crash between claim and send
    // results in at-most-once delivery, never duplicates.
    db.prepare(
      "INSERT INTO daily_summary_sent (plant_id, generation_date, sent_at, generation_kwh) VALUES (?, ?, ?, ?)",
    ).run(deps.archive.PLANT_ID(), todayIst, Date.now(), figures.kwh ?? null);

    await deps.sendPush({
      kind: "daily_summary",
      title: "EnergyScope — Daily Production Summary",
      body: buildSummaryBody({ todayKwh: figures.kwh ?? NaN, rank, peak: figures.peak }),
      url: "/history",
    });
    log(`Daily summary sent for ${todayIst}.`);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      await observeInverter();
      await maybeSendDailySummary();
      // Persistent push retries ride the existing monitor loop; only rows
      // whose next_attempt_at is due actually deliver (~every 30 minutes).
      if (typeof deps.push.processDueRetries === "function") {
        await deps.push.processDueRetries();
      }
    } catch (err) {
      log(`Tick error: ${err.message}`);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    log(`Monitor started (poll every ${Math.round(deps.pollMs / 1000)}s).`);
    // First pass shortly after boot so state converges without blocking listen().
    timer = setInterval(() => {
      tick().catch((e) => log(`Timer error: ${e.message}`));
    }, deps.pollMs);
    timer.unref?.();
    setTimeout(() => {
      tick().catch((e) => log(`Startup tick error: ${e.message}`));
    }, 5000).unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    tick,
    start,
    stop,
    // Exposed for tests and the dev-only test endpoint.
    _internals: {
      observeInverter,
      maybeSendDailySummary,
      getTodaySunset,
      buildDailyFigures,
    },
  };
}

/**
 * Build (but do not send) the daily-summary payload for a given IST date.
 * Used by the dev-only test endpoint and tests. Respects idempotency unless
 * { force: true }.
 */
async function buildDailySummaryPayload(options = {}) {
  const deps = {
    db: options.db || require("../data/notificationDatabase"),
    push: options.push || pushService,
    utlApi: options.utlApi || utlApi,
    weather: options.weather || weatherService,
    collector: options.collector || collector,
    archive: options.archive || archiveService,
  };
  const todayIst = options.dateIst || deps.archive.istDateString(new Date());
  const session = await deps.collector.ensureCollectorSession();

  const monitor = createMonitor({ ...options, db: deps.db });
  const figures = await monitor._internals.buildDailyFigures(todayIst, session);
  if (!figures) return null;

  const archivedRows = deps.archive
    .getDailyRecords({})
    .filter((r) => r.generation_date !== todayIst);
  const rank = computeRank(figures.kwh ?? NaN, archivedRows);

  return {
    kind: "daily_summary",
    title: "EnergyScope — Daily Production Summary",
    body: buildSummaryBody({ todayKwh: figures.kwh ?? NaN, rank, peak: figures.peak }),
    url: "/history",
  };
}

module.exports = {
  createMonitor,
  computePeak,
  computeRank,
  buildSummaryBody,
  istTimeString,
  computeSunsetUtc,
  buildDailySummaryPayload,
};
