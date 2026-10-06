const express = require("express");
const router = express.Router();

const { getProductionHistory } = require("../services/exportService");
const {
  generateHistoryCsv,
  generateHistoryExcel,
  generateHistoryPdf,
  buildMeta,
} = require("../services/exportGenerator");
const {
  ExportScopeError,
  generatedOnLabel,
  plantMeta,
  periodSlug,
  resolveExportScope,
  summarizeProductionHistory,
} = require("../services/exportScope");
const { istDateString } = require("../services/archiveService");

/**
 * One authenticated export endpoint for every format. A single `format` parameter
 * selects the generator instead of three near-identical routes, and one scope
 * resolver serves date / range / month / year.
 *
 * GET /api/export?format=csv|xlsx|pdf
 *                  &scope=date|range|month|year
 *                  [&date=YYYY-MM-DD]  scope=date
 *                  [&from=&to=YYYY-MM-DD]  scope=range
 *                  [&month=YYYY-MM]  scope=month
 *                  [&year=YYYY]  scope=year
 */
const FORMATS = {
  csv: {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    generate: (payload) => generateHistoryCsv(payload),
  },
  xlsx: {
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    generate: (payload) => generateHistoryExcel(payload),
  },
  pdf: {
    extension: "pdf",
    contentType: "application/pdf",
    generate: (payload) => generateHistoryPdf(payload),
  },
};

/** Query values win; `fallbacks` only fill the gaps the legacy URLs rely on. */
function param(req, name, fallback) {
  const value = req.query[name];
  return value === undefined ? fallback : value;
}

function currentMonthFallbacks() {
  const today = istDateString(new Date());
  return { scope: "month", month: today.slice(0, 7) };
}

async function handleExportRequest(req, res, fallbacks = {}) {
  try {
    const requested = String(param(req, "format", fallbacks.format) ?? "")
      .trim()
      .toLowerCase();

    const spec = FORMATS[requested];
    if (!spec) {
      throw new ExportScopeError(
        `Unsupported export format "${param(req, "format", fallbacks.format) ?? ""}". Use one of: ${Object.keys(FORMATS).join(", ")}.`,
      );
    }

    const resolved = resolveExportScope({
      scope: param(req, "scope", fallbacks.scope),
      date: param(req, "date", fallbacks.date),
      from: param(req, "from", fallbacks.from),
      to: param(req, "to", fallbacks.to),
      month: param(req, "month", fallbacks.month),
      year: param(req, "year", fallbacks.year),
    });

    const rows = await getProductionHistory(req.token, req.session, {
      from: resolved.from,
      to: resolved.to,
    });

    const body = await spec.generate({
      rows,
      resolved,
      meta: buildMeta({
        resolved,
        summary: summarizeProductionHistory(rows),
        generatedOn: generatedOnLabel(),
        plant: plantMeta(),
      }),
    });

    res.setHeader("Content-Type", spec.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="utl-production-${periodSlug(resolved.label)}.${spec.extension}"`,
    );
    // No-store: an export is a point-in-time snapshot and must never be cached.
    res.setHeader("Cache-Control", "no-store");

    return res.send(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
  } catch (err) {
    if (err instanceof ExportScopeError) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Detail is logged server-side only; the client gets a usable message and
    // never internal text (session ids, upstream URLs, stack fragments).
    console.error(`[export] ${requestedFormatHint(req)} failed:`, err.message);

    return res.status(500).json({
      success: false,
      message: "The export could not be generated. Please try again.",
    });
  }
}

function requestedFormatHint(req) {
  return String(req.query.format ?? "export");
}

router.get("/", (req, res) => handleExportRequest(req, res));

// Legacy URLs from the original Settings buttons. They now run the SAME handler
// so there is exactly one export implementation, defaulting to the current
// calendar month (the behaviour those URLs always had).
router.get("/csv", (req, res) =>
  handleExportRequest(req, res, { ...currentMonthFallbacks(), format: "csv" }),
);

router.get("/excel", (req, res) =>
  handleExportRequest(req, res, { ...currentMonthFallbacks(), format: "xlsx" }),
);

module.exports = router;
