const ExcelJS = require("exceljs");
function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function generateCsv(data) {
  const lines = [];

  lines.push(["UTL Solar Export"]);
  lines.push([]);

  lines.push(["Daily Production"]);
  lines.push(["Time", "Power (W)"]);

  for (const row of data.daily.results ?? []) {
    lines.push([row.timeMinutes, row.PvProduction]);
  }

  lines.push([]);
  lines.push(["Monthly Production"]);
  lines.push(["Day", "Energy (kWh)"]);

  for (const row of data.monthly.results ?? []) {
    lines.push([row.date, row.PvProduction]);
  }

  lines.push([]);
  lines.push(["Yearly Production"]);
  lines.push(["Month", "Energy (MWh)"]);

  for (const row of data.yearly.results ?? []) {
    lines.push([row.month, row.PvProduction]);
  }

  lines.push([]);
  lines.push(["Lifetime Production"]);
  lines.push(["Year", "Energy (MWh)"]);

  for (const row of data.total.results ?? []) {
    lines.push([row.year, row.PvProduction]);
  }

  return lines.map((line) => line.map(csvEscape).join(",")).join("\n");
}

async function generateExcel(data) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "EnergyScope Pro";
  workbook.created = new Date();

  const monthly = workbook.addWorksheet("Monthly");
  monthly.columns = [
    { header: "Day", key: "day", width: 12 },
    { header: "Energy (kWh)", key: "energy", width: 18 },
  ];

  (data.monthly.results ?? []).forEach((row) => {
    monthly.addRow({
      day: row.date,
      energy: row.PvProduction,
    });
  });

  const yearly = workbook.addWorksheet("Yearly");
  yearly.columns = [
    { header: "Month", key: "month", width: 18 },
    { header: "Energy (kWh)", key: "energy", width: 18 },
  ];

  (data.yearly.results ?? []).forEach((row) => {
    yearly.addRow({
      month: new Date(Number(data.yearly.data.date_parameter), row.month - 1, 1).toLocaleString(
        "en-US",
        {
          month: "short",
          year: "numeric",
        },
      ),
      energy: (row.PvProduction * 1000).toFixed(2),
    });
  });
  const total = workbook.addWorksheet("Lifetime");
  total.columns = [
    { header: "Year", key: "year", width: 12 },
    { header: "Energy (kWh)", key: "energy", width: 18 },
  ];

  (data.total.results ?? []).forEach((row) => {
    total.addRow({
      year: row.year,
      energy: (row.PvProduction * 1000).toFixed(2),
    });
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  generateCsv,
  generateExcel,
};
