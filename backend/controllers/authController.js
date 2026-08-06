const authService = require("../services/authService");

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    return res.json(result);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  login,
};