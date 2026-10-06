const { getPlantStatus, utlFetch } = require("./utlApi");
const { istDateString } = require("./archiveService");
const { eachCalendarDate, monthKeysBetween, normalizeChartDate } = require("./exportScope");

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function postChart(jwtToken, session, endpoint, dateParameter = null) {
  const plantStatus = await getPlantStatus(jwtToken, session);
  console.log("Plant status response:", JSON.stringify(plantStatus, null, 2));

  const plantId = plantStatus?.data?.total?.plantIds?.[0];

  if (!plantId) {
    throw new Error("Plant ID missing.");
  }

  const body = {
    plant_id: plantId,
  };

  if (dateParameter) {
    body.date_parameter = dateParameter;
  }

  const response = await utlFetch(
    jwtToken,
    session,
    `https://utlsolarrms.com/api/charts/solar_power_per_plant/${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  console.log("Chart status:", response.status);

  const text = await response.text();

  console.log("Chart response:", text);

  return JSON.parse(text);
}

async function getExportData(jwtToken, session, month, year) {
  const today = istDateString(new Date());

  const [daily, monthly, yearly, total] = await Promise.all([
    postChart(jwtToken, session, "daily", today),
    postChart(jwtToken, session, "monthly", month),
    postChart(jwtToken, session, "yearly", year),
    postChart(jwtToken, session, "total"),
  ]);

  return {
    daily,
    monthly,
    yearly,
    total,
  };
}

async function getLast30DaysGeneration(jwtToken, session, referenceDate = new Date()) {
  const monthsNeeded = new Set();

  // Look back 29 completed days (exclude today)
  for (let i = 1; i <= 29; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    monthsNeeded.add(monthKey(d));
  }

  // Fetch every required month only once
  const monthResults = new Map();

  await Promise.all(
    [...monthsNeeded].map(async (month) => {
      const response = await postChart(jwtToken, session, "monthly", month);

      monthResults.set(month, response.results ?? []);
    }),
  );

  const history = [];

  for (let i = 1; i <= 29; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);

    const month = monthKey(d);

    const results = monthResults.get(month) ?? [];

    const row = results.find((r) => Number(r.date) === d.getDate());

    if (!row) continue;

    history.push({
      date: d.toISOString().slice(0, 10),
      generation: Number(row.PvProduction ?? 0),
    });
  }

  return history;
}

/**
 * Authoritative production history for an inclusive date range, from UTL's own
 * monthly chart endpoint - the same source the History page's Daily tab reads,
 * so an export never disagrees with the values already on screen.
 *
 * UTL's monthly endpoint returns one row per day of the requested month with a
 * day-of-month `date`, so a range is served by fetching each month it touches
 * exactly once. Every calendar day in the range is returned, including days UTL
 * has no row for: those come back as `{ recorded: false, kwh: null }` so the
 * export can distinguish "no record" from a genuine 0 kWh day instead of
 * silently zero-filling.
 *
 * @param {string} jwtToken
 * @param {object} session
 * @param {{from: string, to: string}} bounds inclusive 'YYYY-MM-DD'
 * @returns {Promise<Array<{date: string, kwh: number|null, recorded: boolean}>>}
 */
async function getProductionHistory(jwtToken, session, { from, to } = {}) {
  const monthKeys = monthKeysBetween(from, to);
  const responses = await Promise.all(
    monthKeys.map((key) => postChart(jwtToken, session, "monthly", key)),
  );

  const byDate = new Map();

  responses.forEach((response, index) => {
    const key = monthKeys[index];
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));

    for (const point of response?.results ?? []) {
      const date = normalizeChartDate(point.date, year, month);
      if (!date) continue;

      const kwh = Number(point.PvProduction);
      if (!Number.isFinite(kwh)) continue;

      byDate.set(date, kwh);
    }
  });

  return eachCalendarDate(from, to).map((date) =>
    byDate.has(date)
      ? { date, kwh: byDate.get(date), recorded: true }
      : { date, kwh: null, recorded: false },
  );
}

module.exports = {
  postChart,
  getExportData,
  getLast30DaysGeneration,
  getProductionHistory,
};
