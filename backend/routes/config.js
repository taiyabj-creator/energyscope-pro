const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "../config/plant.json");

router.get("/plant-config", (req, res) => {
  const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
  res.json(data);
});

router.put("/plant-config", (req, res) => {
  fs.writeFileSync(
    configPath,
    JSON.stringify(req.body, null, 2)
  );

  res.json({
    success: true,
    message: "Plant configuration updated."
  });
});

module.exports = router;