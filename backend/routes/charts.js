const express = require("express");

const router = express.Router();

const { getToken, getPlantId } = require("../services/utlApi");

async function callChart(endpoint, dateParameter = null) {
  
  const token = getToken();
  const plantId = getPlantId();

  

  if (!token) {
    throw new Error("Authentication token missing.");
  }

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
        Authorization: `Bearer ${token}`,
        "X-Device-ID": "hbeon_mobile",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  

  const data = await response.json();

  

  return data;
}

router.get("/daily", async (req, res) => {
  try {
    const date =
  req.query.date || new Date().toISOString().slice(0, 10);

res.json(await callChart("daily", date));
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

res.json(await callChart("monthly", month));
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

res.json(await callChart("yearly", year));
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
    res.json(await callChart("total"));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;