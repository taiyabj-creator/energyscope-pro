const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let token = null;
let plantId = null;
const PYTHON_SCRIPT = path.join(
  __dirname,
  "../adapters/python/utl_api.py"
);

const TOKEN_FILE = path.join(
  __dirname,
  "../adapters/python/token.txt"
);

async function login() {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [PYTHON_SCRIPT]);

    py.stdout.on("data", (data) => {
      process.stdout.write(data);
    });

    py.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    py.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}`));
      }

      try {
        token = fs
  .readFileSync(TOKEN_FILE, "utf8")
  .trim();

        await loadPlantId();

        resolve(token);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function loadPlantId() {
  const response = await fetch(
    "https://utlsolarrms.com/api/plantStatus",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Device-ID": "hbeon_mobile",
        Accept: "application/json",
      },
    }
  );

  const data = await response.json();

  if (
    data.success &&
    data.data &&
    data.data.total &&
    data.data.total.plantIds &&
    data.data.total.plantIds.length > 0
  ) {
    plantId = data.data.total.plantIds[0];
   
  } else {
    throw new Error("No plant found.");
  }
}

function getToken() {
  return token;
}

function getPlantId() {
  return plantId;
}
async function getPlantStatus() {
  const response = await fetch(
    "https://utlsolarrms.com/api/plantStatus",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Device-ID": "hbeon_mobile",
        Accept: "application/json",
      },
    }
  );

  return response.json();
}
module.exports = {
  login,
  getToken,
  getPlantId,
  getPlantStatus,
};