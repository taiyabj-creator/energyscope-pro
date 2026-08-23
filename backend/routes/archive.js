const express = require("express");

const router = express.Router();
const archiveService = require("../services/archiveService");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_YEAR = /^\d{4}$/;
const MAX_RANGE_DAYS = 400;

function isValidIsoDate(s) {
  if (!ISO_DATE.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

// Operational snapshot - intentionally excludes any database or credential
// internals.
router.get("/status", async (req, res) => {
  try {
    res.json({ success: true, data: archiveService.getCoverage() });
  } catch (err) {
    console.error("[ARCHIVE] status error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

router.get("/daily", async (req, res) => {
  try {
    const { date, from, to } = req.query;

    if (!date && !from && !to) {
      return badRequest(res, "Provide ?date=YYYY-MM-DD or ?from=&to=");
    }

    if (date) {
      if (!isValidIsoDate(date)) {
        return badRequest(res, "date must be a valid YYYY-MM-DD calendar date.");
      }
      const rows = archiveService.getDailyRecords({ date });
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No archived record for ${date}.`,
        });
      }
      return res.json({ success: true, data: rows[0] });
    }

    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
      return badRequest(res, "from/to must be valid YYYY-MM-DD dates with from <= to.");
    }

    let cursor = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    const spanDays = Math.round((end - cursor) / 86400000);
    if (spanDays > MAX_RANGE_DAYS) {
      return badRequest(res, `Range too large; max ${MAX_RANGE_DAYS} days.`);
    }

    res.json({
      success: true,
      data: archiveService.getDailyRecords({ from, to }),
    });
  } catch (err) {
    console.error("[ARCHIVE] daily error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

router.get("/monthly", async (req, res) => {
  try {
    const { month } = req.query;

    if (!ISO_MONTH.test(month || "")) {
      return badRequest(res, "month must be in YYYY-MM format.");
    }

    const row = archiveService.getMonthlyTotal(month);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: `No archived records for ${month}.`,
      });
    }

    res.json({ success: true, data: { ...row, plant_id: archiveService.PLANT_ID() } });
  } catch (err) {
    console.error("[ARCHIVE] monthly error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

router.get("/yearly", async (req, res) => {
  try {
    const { year } = req.query;

    if (!ISO_YEAR.test(year || "")) {
      return badRequest(res, "year must be a valid YYYY value.");
    }

    const row = archiveService.getYearlyTotal(year);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: `No archived records for ${year}.`,
      });
    }

    res.json({ success: true, data: { ...row, plant_id: archiveService.PLANT_ID() } });
  } catch (err) {
    console.error("[ARCHIVE] yearly error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

router.get("/total", async (req, res) => {
  try {
    const row = archiveService.getLifetimeTotal();
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Archive is empty.",
      });
    }

    res.json({ success: true, data: row });
  } catch (err) {
    console.error("[ARCHIVE] total error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

module.exports = router;
