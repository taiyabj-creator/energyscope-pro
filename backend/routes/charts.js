const express = require("express");

const router = express.Router();

const {
  getPlantStatus,
  utlFetch,
} = require("../services/utlApi");

async function callChart(req, endpoint, dateParameter = null) {
  
  const session = req.session;

if (!session.utlToken) {
  throw new Error("Authentication token missing.");
}

const plantStatus = await getPlantStatus(
  req.token,
  session
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

  

  const response = await utlFetch(
  req.token,
  session,
  `https://utlsolarrms.com/api/charts/solar_power_per_plant/${endpoint}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
);



const text = await response.text();
const data = JSON.parse(text);

return data;


}

router.get("/daily", async (req, res) => {
  try {
    const date =
  req.query.date || new Date().toISOString().slice(0, 10);

res.json(await callChart(req, "daily", date));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/monthly", async (req, res) => {
  try {
    const now = new Date();

const month =
  req.query.month ||
  (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0")
  );

res.json(await callChart(req, "monthly", month));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/yearly", async (req, res) => {
  try {
    const year =
  req.query.year || String(new Date().getFullYear());

res.json(await callChart(req, "yearly", year));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/total", async (req, res) => {
  try {
    res.json(await callChart(req, "total"));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;