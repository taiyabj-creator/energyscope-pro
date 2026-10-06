const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

/** The user-facing name of a generated file, used in every format. */
const RECORD_RECORDED = "Recorded";
const RECORD_RECORDED_ZERO = "Recorded (0 kWh)";
const RECORD_MISSING = "No record";

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function recordLabel(row) {
  if (!row.recorded) return RECORD_MISSING;
  return row.kwh === 0 ? RECORD_RECORDED_ZERO : RECORD_RECORDED;
}

/**
 * Header block shared by all three formats so a user can always tell WHICH
 * period a file covers and WHEN it was produced.
 */
function buildMeta({ resolved, summary, generatedOn, plant }) {
  return {
    plantName: plant.name,
    plantLocation: plant.location,
    periodLabel: resolved.label,
    generatedOn,
    dataSource: "UTL Production Data",
    summary,
  };
}

/**
 * Production history as CSV.
 *
 * Column names match the History page's existing client-side export
 * ("Date" / "Generation (kWh)") so switching an export onto the server does not
 * change a user's spreadsheet. A third "Record" column keeps "no record" visibly
 * different from "0 kWh recorded": an unrecorded day exports an EMPTY energy cell
 * rather than a zero.
 */
function generateHistoryCsv({ rows, meta }) {
  const lines = [];

  lines.push(["UTL Solar Export"]);
  lines.push([]);
  lines.push(["Plant", meta.plantName]);
  lines.push(["Selected period", meta.periodLabel]);
  lines.push(["Generated on", meta.generatedOn]);
  lines.push(["Data source", meta.dataSource]);
  lines.push([]);
  lines.push(["Date", "Generation (kWh)", "Record"]);

  for (const row of rows) {
    lines.push([row.date, row.recorded ? String(row.kwh) : "", recordLabel(row)]);
  }

  lines.push([]);
  lines.push(["Total generation (kWh)", String(meta.summary.totalKwh)]);
  lines.push(["Recorded days", String(meta.summary.recordedDays)]);
  lines.push(["Days without record", String(meta.summary.daysWithoutRecord)]);

  return lines.map((line) => line.map(csvEscape).join(",")).join("\n");
}

/**
 * Production history as a real .xlsx workbook (exceljs, already the project's
 * spreadsheet dependency). Unrecorded days carry a genuinely empty cell plus a
 * "No record" label instead of a numeric 0.
 */
async function generateHistoryExcel({ rows, meta }) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "EnergyScope Pro";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Production History");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Generation (kWh)", key: "kwh", width: 18 },
    { header: "Record", key: "record", width: 18 },
  ];

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      kwh: row.recorded ? row.kwh : null,
      record: recordLabel(row),
    });
  }

  sheet.addRow({});

  const summaryRows = [
    ["Plant", meta.plantName],
    ["Selected period", meta.periodLabel],
    ["Generated on", meta.generatedOn],
    ["Data source", meta.dataSource],
    ["Total generation (kWh)", meta.summary.totalKwh],
    ["Recorded days", meta.summary.recordedDays],
    ["Days without record", meta.summary.daysWithoutRecord],
  ];

  for (const [label, value] of summaryRows) {
    const added = sheet.addRow({ date: label, kwh: value });
    added.font = { bold: label === "Total generation (kWh)" };
  }

  return workbook.xlsx.writeBuffer();
}

const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const RULE = "#cbd5e1";

/**
 * Production history as a clean, printable A4 report (pdfkit, already a declared
 * backend dependency - no PDF library is shipped to the browser).
 *
 * Layout: title block with plant / period / generated-on, then the daily table
 * with repeating header rows across pages, then the totals.
 */
function generateHistoryPdf({ rows, meta }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colGeneration = left + contentWidth * 0.52;
    const colRecord = left + contentWidth * 0.8;
    const ROW_HEIGHT = 14;

    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text("EnergyScope Pro");
    doc.moveDown(0.1);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Production History");
    doc.moveDown(0.7);

    doc.font("Helvetica").fontSize(10).fillColor(BODY);
    doc.text(`Plant: ${meta.plantName}`);
    if (meta.plantLocation) doc.text(`Location: ${meta.plantLocation}`);
    doc.text(`Selected period: ${meta.periodLabel}`);
    doc.text(`Generated on: ${meta.generatedOn}`);
    doc.text(`Data source: ${meta.dataSource}`);
    doc.moveDown(0.9);

    const drawHeader = () => {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
      doc.text("Date", left, y, { width: contentWidth * 0.5 });
      doc.text("Generation (kWh)", colGeneration, y, {
        width: contentWidth * 0.26,
        align: "right",
      });
      doc.text("Record", colRecord, y, { width: contentWidth * 0.2, align: "right" });
      doc.y = y + 3;
      doc
        .moveTo(left, doc.y)
        .lineTo(left + contentWidth, doc.y)
        .lineWidth(0.75)
        .strokeColor(RULE)
        .stroke();
      doc.y += 6;
    };

    drawHeader();

    doc.font("Helvetica").fontSize(9.5).fillColor(BODY);

    for (const row of rows) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - ROW_HEIGHT * 2) {
        doc.addPage();
        drawHeader();
        doc.font("Helvetica").fontSize(9.5).fillColor(BODY);
      }

      const y = doc.y;
      doc.text(row.date, left, y, { width: contentWidth * 0.5 });
      doc.text(row.recorded ? row.kwh.toFixed(2) : "—", colGeneration, y, {
        width: contentWidth * 0.26,
        align: "right",
      });
      doc
        .fillColor(row.recorded ? BODY : MUTED)
        .text(recordLabel(row), colRecord, y, { width: contentWidth * 0.2, align: "right" });
      doc.fillColor(BODY);
      doc.y = y + ROW_HEIGHT;
    }

    if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();

    doc.moveDown(1);
    const summaryTop = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Summary", left, summaryTop);
    doc.font("Helvetica").fontSize(10).fillColor(BODY);
    doc.text(`Total generation: ${meta.summary.totalKwh.toFixed(2)} kWh`, left, doc.y + 4);
    doc.text(`Number of recorded days: ${meta.summary.recordedDays}`, left, doc.y + 3);
    doc.text(`Days without record: ${meta.summary.daysWithoutRecord}`, left, doc.y + 3);

    if (meta.summary.daysWithoutRecord > 0) {
      doc.moveDown(0.4);
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(MUTED)
        .text(
          'Dates shown as "No record" were returned by UTL without a production record. They are not zero-generation days and are excluded from the total above.',
          left,
          doc.y,
          { width: contentWidth },
        );
    }

    doc.end();
  });
}

module.exports = {
  generateHistoryCsv,
  generateHistoryExcel,
  generateHistoryPdf,
  buildMeta,
};
