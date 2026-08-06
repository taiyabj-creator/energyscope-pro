const express = require("express");
const router = express.Router();

const {
  getMaintenance,
  updateMaintenance,
} = require("../services/maintenanceService");

router.get("/", async (req, res) => {
  try {
    const data = await getMaintenance();

    res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await updateMaintenance(req.body);

    res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;