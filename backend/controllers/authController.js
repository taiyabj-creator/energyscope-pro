const authService = require("../services/authService");

async function login(req, res) {
  try {
    const { email, password, rememberMe } = req.body;

    const result = await authService.login(email, password, rememberMe);

    return res.json(result);
  } catch (err) {
    console.error("Login error:", err.message);

    if (err.code === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS",
      });
    }

    return res.status(500).json({
      success: false,
      error: "AUTH_SERVICE_ERROR",
    });
  }
}

async function logout(req, res) {
  try {
    await authService.logout(req.token);

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("Logout error:", err.message);

    return res.status(500).json({
      success: false,
      error: "LOGOUT_FAILED",
    });
  }
}

module.exports = {
  login,
  logout,
};
