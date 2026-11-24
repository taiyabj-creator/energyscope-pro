/**
 * Environmental & economic benefit estimates for the dashboard.
 *
 * Every figure is derived from the canonical EnergyScope Archive lifetime
 * generation (`archiveService.getLifetimeTotal()`), so this panel can never
 * disagree with the rest of the historical metrics.
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

const CO2_KG_PER_KWH = 0.71;
const COAL_KG_PER_KWH = 0.7;
const TREE_KG_CO2_PER_YEAR = 21;
const DEFAULT_TARIFF_INR_PER_KWH = 6.5;

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function tariffInrPerKwh() {
  const configured = Number(process.env.BENEFIT_TARIFF_INR_PER_KWH);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_TARIFF_INR_PER_KWH;
}

/** Pure conversion so the maths stays testable and identical for every caller. */
function computeBenefits(generationKwh) {
  const energy =
    Number.isFinite(generationKwh) && generationKwh > 0 ? generationKwh : 0;
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

/** Benefits over the whole archived lifetime, or null when the archive is empty. */
function getLifetimeBenefits() {
  const total = archiveService.getLifetimeTotal();

  if (!total) return null;

  return {
    ...computeBenefits(Number(total.generation_kwh)),
    days_reported: total.days_reported,
    first_day: total.first_day,
    last_day: total.last_day,
  };
}

module.exports = {
  computeBenefits,
  getLifetimeBenefits,
};
