const fs = require("fs/promises");
const path = require("path");

const FILE = path.join(__dirname, "../data/maintenance.json");

async function loadMaintenance() {
  const raw = await fs.readFile(FILE, "utf8");
  return JSON.parse(raw);
}

async function saveMaintenance(data) {
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

function addDays(dateString, days) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
function scoreFromDueDays(daysRemaining, interval) {
  if (daysRemaining >= interval * 0.5) return 100;
  if (daysRemaining >= interval * 0.25) return 95;
  if (daysRemaining >= 0) return 90;

  const overdue = Math.abs(daysRemaining);

  if (overdue <= 7) return 80;
  if (overdue <= 30) return 60;
  if (overdue <= 60) return 40;

  return 20;
}

async function getMaintenance() {
  const data = await loadMaintenance();

  const nextCleaning = addDays(data.lastCleaning, 60);
  const nextInspection = addDays(data.lastInspection, 180);

  const cleaningDueIn = daysBetween(nextCleaning);
  const inspectionDueIn = daysBetween(nextInspection);

  const cleaningScore = scoreFromDueDays(cleaningDueIn, 60);
  const inspectionScore = scoreFromDueDays(inspectionDueIn, 180);

  const healthScore = Math.round(cleaningScore * 0.5 + inspectionScore * 0.5);

  return {
    lastCleaning: data.lastCleaning,
    nextCleaning: nextCleaning.toISOString().slice(0, 10),
    cleaningDueIn,

    lastInspection: data.lastInspection,
    nextInspection: nextInspection.toISOString().slice(0, 10),
    inspectionDueIn,
    healthScore,

    history: (data.history ?? []).sort((a, b) => new Date(b.date) - new Date(a.date)),
  };
}

async function updateMaintenance(update) {
  const current = await loadMaintenance();

  if (update.lastCleaning && update.lastCleaning !== current.lastCleaning) {
    current.lastCleaning = update.lastCleaning;

    current.history.push({
      id: `cleaning-${update.lastCleaning}`,
      date: update.lastCleaning,
      type: "cleaning",
      title: "Panels cleaned",
      note: "Recorded by user",
    });
  }

  if (update.lastInspection && update.lastInspection !== current.lastInspection) {
    current.lastInspection = update.lastInspection;

    current.history.push({
      id: `inspection-${update.lastInspection}`,
      date: update.lastInspection,
      type: "inspection",
      title: "Inspection completed",
      note: "Recorded by user",
    });
  }

  await saveMaintenance(current);

  return getMaintenance();
}

module.exports = {
  getMaintenance,
  updateMaintenance,
};
