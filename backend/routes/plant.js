const express = require("express");

const router = express.Router();

const { getPlantStatus } = require("../services/utlApi");

router.get("/", async (req, res) => {
  try {
    const data = await getPlantStatus();
    res.json(data);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;