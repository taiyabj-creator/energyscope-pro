const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");

async function login(
  email,
  password,
  rememberMe = true
) {
  const response = await pythonAdapter.login(email, password);

 

  if (!response.success) {
    throw new Error(response.message || "Invalid email or password.");
  }

  const dashboardToken = jwt.sign(
    {
      email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: rememberMe ? "7d" : "12h",
    }
  );

  // Convert values like "365d" into milliseconds
  const match = /^(\d+)d$/.exec(response.expires_in);

  if (!match) {
    throw new Error(`Unsupported expires_in format: ${response.expires_in}`);
  }

  const expiresAt =
    Date.now() + Number(match[1]) * 24 * 60 * 60 * 1000;

  console.log("Creating dashboard session...");

sessionService.createSession(dashboardToken, {
  email,
  password,
  device_id: crypto.randomUUID(),
  utlToken: response.token,
  expiresAt,
  remember_me: rememberMe,
});

console.log("Dashboard session created.");

  return {
    success: true,
    token: dashboardToken,
  };
}
async function logout(token) {
  sessionService.deleteSession(token);
}

module.exports = {
  login,
  logout,
};