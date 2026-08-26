const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.1.0",
  });
});

module.exports = router;
