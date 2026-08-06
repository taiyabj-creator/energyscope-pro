const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pythonAdapter = require("../adapters/pythonAdapter");
const sessionService = require("./sessionService");

async function login(email, password) {
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
      expiresIn: "7d",
    }
  );

  sessionService.createSession(dashboardToken, {
    email,
    utlToken: response.token,
    expiresAt: Date.now() + (response.expires_in * 1000),
  });

  return {
    success: true,
    token: dashboardToken,
  };
}

module.exports = {
  login,
};