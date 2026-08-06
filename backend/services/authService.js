const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");

async function login(email, password) {
  const response = await pythonAdapter.login(email, password);

  console.log(response);

  if (!response.success) {
    throw new Error(response.message || "Invalid email or password.");
  }

  const dashboardToken = jwt.sign(
    {
      email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  // Convert values like "365d" into milliseconds
  const match = /^(\d+)d$/.exec(response.expires_in);

  if (!match) {
    throw new Error(`Unsupported expires_in format: ${response.expires_in}`);
  }

  const expiresAt =
    Date.now() + Number(match[1]) * 24 * 60 * 60 * 1000;

  sessionService.createSession(dashboardToken, {
    email,
    device_id: crypto.randomUUID(),
    utlToken: response.token,
    expiresAt,
    remember_me: true,
  });

  return {
    success: true,
    token: dashboardToken,
  };
}

module.exports = {
  login,
};