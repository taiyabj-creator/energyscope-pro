const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");


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
async function getPlantStatus(jwtToken, session) {
  console.log(
    "UTL token:",
    session.utlToken.substring(0, 40)
  );

  const response = await utlFetch(
    jwtToken,
    session,
    "https://utlsolarrms.com/api/plantStatus",
    {
      method: "GET",
    }
  );

  console.log("Status:", response.status);

  const text = await response.text();

  console.log("Response body:", text);

  return JSON.parse(text);
}

async function refreshSessionToken(jwtToken, session) {
  console.log("Refreshing expired UTL token...");

  const response = await pythonAdapter.login(
    session.email,
    session.password
  );

  if (!response.success) {
    throw new Error("Failed to refresh UTL token.");
  }

  session.utlToken = response.token;

  sessionService.updateSession(jwtToken, {
    utlToken: response.token,
  });

  return response.token;
}

async function utlFetch(jwtToken, session, url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.utlToken}`,
      "X-Device-ID": "hbeon_mobile",
      Accept: "application/json",
    },
  });

  // Request succeeded
  if (response.status !== 401) {
    return response;
  }

  console.log("UTL token expired. Refreshing...");

  await refreshSessionToken(jwtToken, session);

  // Retry once with the new token
  response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.utlToken}`,
      "X-Device-ID": "hbeon_mobile",
      Accept: "application/json",
    },
  });

  // Refresh failed or new token is still rejected
  if (response.status === 401) {
    throw new Error("UTL token refresh failed.");
  }

  return response;
}

module.exports = {
  login,
  getToken,
  getPlantId,
  getPlantStatus,
  refreshSessionToken,
  utlFetch,
};