/**
 * Environmental & economic benefit estimates for the dashboard.
 *
 * The energy figure is the UTL inverter's own cumulative lifetime counter
 * (`InverterDevice.daily_energy_produced`), fetched live through the backend's
 * authenticated UTL session. That is the same lifetime value the dashboard and
 * profile pages show, so the benefits panel can never disagree with them.
 *
 * The archive lifetime total is only a degraded fallback for the window where
 * UTL is unreachable. Responses carry `generation_source` so clients can state
 * which value was used instead of presenting an archived subtotal as lifetime.
 *
 * The conversion factors are documented, auditable constants - not values
 * copied from the vendor app and not a claim of vendor parity:
 *   - CO2:       0.71 kg CO2 per kWh, CEA India grid CO2 baseline emission
 *                factor (the grid you would otherwise draw from).
 *   - Coal:      0.70 kg coal per kWh, typical Indian coal-fleet fuel burn.
 *   - Trees:     21 kg CO2 absorbed per mature tree per year.
 *   - Tariff:    avoided grid purchase price, default 6.50 INR/kWh, overridable
 *                with BENEFIT_TARIFF_INR_PER_KWH.
 */
const archiveService = require("./archiveService");
const utlApi = require("./utlApi");

const UTL_INVERTER_URL = "https://utlsolarrms.com/api/InverterDevice";
const DEVICE_SN = "ECB50A8FF18D";

const CO2_KG_PER_KWH = 0.71;
const COAL_KG_PER_KWH = 0.7;
const TREE_KG_CO2_PER_YEAR = 21;
const DEFAULT_TARIFF_INR_PER_KWH = 6.5;

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function tariffInrPerKwh() {
  const configured = Number(process.env.BENEFIT_TARIFF_INR_PER_KWH);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TARIFF_INR_PER_KWH;
}

/**
 * UTL's InverterDevice `daily_energy_produced` is a cumulative kWh counter
 * (all-time output), not a daily figure. Mirrors the frontend `utlLifetimeKwh`
 * helper: null when upstream is missing/invalid/empty so a false 0 is never
 * presented as lifetime generation.
 */
function loggerLifetimeKwh(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pure conversion so the maths stays testable and identical for every caller. */
function computeBenefits(generationKwh) {
  const energy = Number.isFinite(generationKwh) && generationKwh > 0 ? generationKwh : 0;
  const co2Kg = energy * CO2_KG_PER_KWH;
  const tariff = tariffInrPerKwh();

  return {
    generation_kwh: round2(energy),
    co2_avoided_kg: round1(co2Kg),
    coal_saved_kg: round1(energy * COAL_KG_PER_KWH),
    trees_equivalent: Math.round(co2Kg / TREE_KG_CO2_PER_YEAR),
    savings_inr: Math.round(energy * tariff),
    tariff_inr_per_kwh: tariff,
    factors: {
      co2_kg_per_kwh: CO2_KG_PER_KWH,
      coal_kg_per_kwh: COAL_KG_PER_KWH,
      tree_kg_co2_per_year: TREE_KG_CO2_PER_YEAR,
    },
  };
}

/**
 * Reads the inverter's cumulative lifetime counter through the authenticated
 * UTL session. Returns null when the counter is unusable.
 */
async function fetchLoggerLifetime(token, session) {
  const response = await utlApi.utlFetch(token, session, UTL_INVERTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_sn: DEVICE_SN }),
  });

  if (!response.ok) {
    throw new Error(`UTL inverter returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const inverter = payload?.data ?? {};
  const kwh = loggerLifetimeKwh(inverter.daily_energy_produced);
  if (kwh === null) return null;

  return {
    generationKwh: kwh,
    observedAt: typeof inverter.timestamp === "string" ? inverter.timestamp : null,
  };
}

/**
 * Lifetime benefits from the UTL logger counter, falling back to the canonical
 * archive total only while the logger is unreachable. Null when neither source
 * has a usable lifetime figure.
 */
async function getLifetimeBenefits({ token, session } = {}) {
  if (token && session?.utlToken) {
    try {
      const logger = await fetchLoggerLifetime(token, session);
      if (logger) {
        return {
          ...computeBenefits(logger.generationKwh),
          generation_source: "utl_logger",
          observed_at: logger.observedAt,
          days_reported: null,
          first_day: null,
          last_day: null,
        };
      }
    } catch (err) {
      console.warn("[BENEFITS] UTL lifetime unavailable:", err.message);
    }
  }

  const total = archiveService.getLifetimeTotal();
  if (!total) return null;

  return {
    ...computeBenefits(Number(total.generation_kwh)),
    generation_source: "archive",
    observed_at: null,
    days_reported: total.days_reported,
    first_day: total.first_day,
    last_day: total.last_day,
  };
}

module.exports = {
  computeBenefits,
  getLifetimeBenefits,
  loggerLifetimeKwh,
};
