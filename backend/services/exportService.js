const { getPlantStatus } = require("./utlApi");

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function postChart(utlToken, endpoint, dateParameter = null) {
  const plantStatus = await getPlantStatus(utlToken);
console.log(
  "Plant status response:",
  JSON.stringify(plantStatus, null, 2)
);

const plantId =
  plantStatus?.data?.total?.plantIds?.[0];

if (!plantId) {
  throw new Error("Plant ID missing.");
}

const body = {
  plant_id: plantId,
};

  if (dateParameter) {
    body.date_parameter = dateParameter;
  }

  const response = await fetch(
    `https://utlsolarrms.com/api/charts/solar_power_per_plant/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${utlToken}`,
        "X-Device-ID": "hbeon_mobile",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  return response.json();
}

async function getExportData(utlToken, month, year) {
  const today = new Date().toISOString().slice(0, 10);

  const [daily, monthly, yearly, total] = await Promise.all([
    postChart(utlToken, "daily", today),
    postChart(utlToken, "monthly", month),
    postChart(utlToken, "yearly", year),
    postChart(utlToken, "total"),
  ]);

  return {
    daily,
    monthly,
    yearly,
    total,
  };
}

async function getLast30DaysGeneration(
  utlToken,
  referenceDate = new Date()
) {
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
      const response = await postChart(
      utlToken,
      "monthly",
      month
      );

      monthResults.set(month, response.results ?? []);
    })
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