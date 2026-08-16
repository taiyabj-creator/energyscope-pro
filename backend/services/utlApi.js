const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");


const PYTHON_SCRIPT = path.join(
  __dirname,
  "../adapters/python/utl_api.py"
);


async function getPlantStatus(jwtToken, session) {
  if (!session?.utlToken) {
    throw new Error("UTL authentication token missing.");
  }

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

  if (!session?.email || !session?.password) {
    throw new Error("UTL login credentials missing.");
  }

  const response = await pythonAdapter.login(
    session.email,
    session.password
  );

  if (!response?.success || !response?.token) {
    throw new Error(
      response?.error || "Failed to refresh UTL token."
    );
  }

  session.utlToken = response.token;

  sessionService.updateSession(jwtToken, {
    utlToken: response.token,
  });

  return response.token;
}

async function utlFetch(jwtToken, session, url, options = {}) {
  if (!session?.utlToken) {
    throw new Error("UTL authentication token missing.");
  }

  let response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.utlToken}`,
      "X-Device-ID": "hbeon_mobile",
      Accept: "application/json",
    },
  });

  if (response.status !== 401) {
    return response;
  }

  console.log("UTL token expired. Refreshing...");

  await refreshSessionToken(jwtToken, session);

  response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.utlToken}`,
      "X-Device-ID": "hbeon_mobile",
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    throw new Error("UTL token refresh failed.");
  }

  return response;
}

module.exports = {
  getPlantStatus,
  refreshSessionToken,
  utlFetch,
};
