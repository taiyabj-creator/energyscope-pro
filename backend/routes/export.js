const express = require("express");
const router = express.Router();

const { getExportData } = require("../services/exportService");

const { generateCsv, generateExcel } = require("../services/exportGenerator");
router.get("/csv", async (req, res) => {
  try {
    const now = new Date();

    const month =
      req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const year = req.query.year || String(now.getFullYear());

    const data = await getExportData(req.token, req.session, month, year);

    const csv = generateCsv(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="utl-export.csv"');

    return res.send(csv);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/excel", async (req, res) => {
  try {
    const now = new Date();

    const month =
      req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const year = req.query.year || String(now.getFullYear());

    const data = await getExportData(req.token, req.session, month, year);

    const excel = await generateExcel(data);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", 'attachment; filename="utl-export.xlsx"');

    return res.send(Buffer.from(excel));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
