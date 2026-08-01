const express = require("express");
const router = express.Router();

const { getToken } = require("../services/utlApi");

const DEVICE_SN = "ECB50A8FF18D";

router.get("/", async (req, res) => {
  try {
    const response = await fetch(
      "https://utlsolarrms.com/api/InverterDevice",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "X-Device-ID": "hbeon_mobile",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          device_sn: DEVICE_SN,
        }),
      }
    );

    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;