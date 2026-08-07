const express = require("express");
const router = express.Router();

const {
  getPlantStatus,
  utlFetch,
} = require("../services/utlApi");
const DEVICE_SN = "ECB50A8FF18D";

router.get("/", async (req, res) => {
  try {
    const response = await utlFetch(
  req.token,
  req.session,
  "https://utlsolarrms.com/api/InverterDevice",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_sn: DEVICE_SN,
    }),
  }
);

    const data = await response.json();
    const plantStatus = await getPlantStatus(
  req.token,
  req.session
);
const plantId =
  plantStatus?.data?.total?.plantIds?.[0];

console.log("Cached plantId:", plantId);
console.log("PlantStatus:", JSON.stringify(plantStatus, null, 2));

let loggerStatus = "0";

if (plantStatus?.data?.online?.plantIds?.includes(plantId)) {
  loggerStatus = "1";
} else if (plantStatus?.data?.offline?.plantIds?.includes(plantId)) {
  loggerStatus = "0";
} else if (plantStatus?.data?.partiallyOffline?.plantIds?.includes(plantId)) {
  loggerStatus = "2";
} else if (plantStatus?.data?.incomplete?.plantIds?.includes(plantId)) {
  loggerStatus = "3";
}

    if (data?.data) {
  data.data.logger_status = loggerStatus;
}

console.log(
  "Final inverter response:",
  JSON.stringify(data, null, 2)
);

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