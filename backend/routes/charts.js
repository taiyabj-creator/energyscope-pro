const express = require("express");

const router = express.Router();

const { getToken, getPlantId } = require("../services/utlApi");

async function callChart(endpoint, dateParameter = null) {
  console.log("================================");
  console.log("Endpoint:", endpoint);

  const token = getToken();
  const plantId = getPlantId();

  console.log("Token exists:", !!token);
  console.log("Plant ID:", plantId);

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

  console.log("Request body:");
  console.log(body);

  console.log("Calling UTL API...");

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

  console.log("UTL replied");
  console.log("Status:", response.status);

  const data = await response.json();

  console.log("JSON parsed");
  console.log("Results:", data.results?.length);

  return data;
}

router.get("/daily", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    res.json(await callChart("daily", today));
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
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0");

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
    res.json(await callChart("yearly", String(new Date().getFullYear())));
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