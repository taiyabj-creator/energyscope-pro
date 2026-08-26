const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");

async function login(email, password, rememberMe = true) {
  let response;

  try {
    response = await pythonAdapter.login(email, password);
  } catch (err) {
    console.error("Login: pythonAdapter failed:", err.message);
    const e = new Error("AUTH_SERVICE_ERROR");
    e.code = "AUTH_SERVICE_ERROR";
    throw e;
  }

  if (!response.success) {
    const e = new Error("INVALID_CREDENTIALS");
    e.code = "INVALID_CREDENTIALS";
    throw e;
  }

  let dashboardToken;

  try {
    dashboardToken = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: rememberMe ? "7d" : "12h",
    });
  } catch (err) {
    console.error("Login: JWT sign failed:", err.message);
    const e = new Error("AUTH_SERVICE_ERROR");
    e.code = "AUTH_SERVICE_ERROR";
    throw e;
  }

  const match = /^(\d+)d$/.exec(response.expires_in);

  if (!match) {
    console.error("Login: unexpected expires_in format:", response.expires_in);
    const e = new Error("AUTH_SERVICE_ERROR");
    e.code = "AUTH_SERVICE_ERROR";
    throw e;
  }

  const expiresAt = Date.now() + Number(match[1]) * 24 * 60 * 60 * 1000;

  try {
    sessionService.createSession(dashboardToken, {
      email,
      password,
      device_id: crypto.randomUUID(),
      utlToken: response.token,
      expiresAt,
      remember_me: rememberMe,
    });
  } catch (err) {
    console.error("Login: session creation failed:", err.message);
    const e = new Error("AUTH_SERVICE_ERROR");
    e.code = "AUTH_SERVICE_ERROR";
    throw e;
  }

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
