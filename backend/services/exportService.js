const { getPlantStatus, utlFetch } = require("./utlApi");
const { istDateString } = require("./archiveService");

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

  // Look back 30 completed days (exclude today)
  for (let i = 1; i <= 30; i++) {
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

  for (let i = 1; i <= 30; i++) {
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

module.exports = {
  postChart,
  getExportData,
  getLast30DaysGeneration,
};
