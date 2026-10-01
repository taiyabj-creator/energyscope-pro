const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const archiveService = require("../services/archiveService");
const masterPassword = require("../services/masterPasswordService");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_YEAR = /^\d{4}$/;
const MAX_RANGE_DAYS = 400;

// Upper bound guarding against accidental/garbled manual values. The plant is
// a 4.305 kWp array: a realistic peak day is ~30 kWh, so 100 kWh/day is an
// extremely generous ceiling while still catching 999/typo-style mistakes.
const MAX_MANUAL_KWH = 100;

// Separate brute-force guard for the master-password endpoint: the dashboard
// session is long-lived, so the manual-entry gate must not be open to
// scripted password guessing.
const manualLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many archive entry attempts. Please try again in 15 minutes.",
  },
});

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

// Canonical dashboard summary (Asia/Kolkata calendar boundaries,
// canonicalGeneration math) powering the Energy Summary cards' Archive
// source. One request covers today / this month / this year plus their
// previous-period trend comparisons.
router.get("/summary", async (req, res) => {
  try {
    res.json({ success: true, data: archiveService.getArchiveSummary() });
  } catch (err) {
    console.error("[ARCHIVE] summary error:", err.message);
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

// Manual Dashboard Archive Entry. Writes one day's archived generation from
// the dashboard, protected by the master password (scrypt hash in
// ARCHIVE_MASTER_PASSWORD_HASH). The session token is already validated by
// authMiddleware at the router mount; this adds the password as a second
// factor for the privileged overwrite. manual_override rows are immutable to
// the collector afterwards.
router.post("/manual", manualLimiter, async (req, res) => {
  try {
    const { generationDate, generationKwh, masterPassword: attempt } = req.body ?? {};

    if (typeof generationDate !== "string" || !isValidIsoDate(generationDate)) {
      return badRequest(res, "generationDate must be a valid YYYY-MM-DD calendar date.");
    }

    if (generationDate > archiveService.istDateString(new Date())) {
      return badRequest(res, "generationDate cannot be in the future.");
    }

    if (
      typeof generationKwh !== "number" ||
      !Number.isFinite(generationKwh) ||
      generationKwh <= 0 ||
      generationKwh > MAX_MANUAL_KWH
    ) {
      return badRequest(
        res,
        `generationKwh must be a finite number greater than 0 and at most ${MAX_MANUAL_KWH}.`,
      );
    }

    // Generic message covers both missing and wrong attempts: no hint at what
    // failed, in case the two are distinguishable by an attacker.
    if (!masterPassword.verifyMasterPassword(attempt)) {
      return res.status(401).json({
        success: false,
        message: "Invalid archive master password.",
      });
    }

    const outcome = archiveService.upsertManualOverride({ generationDate, generationKwh });

    archiveService.logManualOverrideAudit({
      generationDate,
      previousKwh: outcome.previousCanonical,
      newKwh: generationKwh,
      actor: req.user && req.user.email ? req.user.email : "unknown",
      ip: req.ip || null,
      userAgent: req.get("user-agent") || null,
    });

    res.json({
      success: true,
      data: {
        generationDate,
        generationKwh,
        source: "manual_override",
        result: outcome.result,
        previousKwh: outcome.previousCanonical,
      },
    });
  } catch (err) {
    console.error("[ARCHIVE] manual error:", err.message);
    res.status(500).json({ success: false, message: "Archive unavailable." });
  }
});

module.exports = router;
