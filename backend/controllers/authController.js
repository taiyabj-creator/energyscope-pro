const authService = require("../services/authService");

async function login(req, res) {
  try {
    const {
      email,
       password,
      rememberMe,
    } = req.body;

    const result = await authService.login(
      email,
      password,
     rememberMe
    );

    return res.json(result);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message,
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
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  login,
  logout,
};