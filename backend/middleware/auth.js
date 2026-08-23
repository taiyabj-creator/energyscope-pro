const jwt = require("jsonwebtoken");
const sessionService = require("../services/sessionService");

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = header.replace("Bearer ", "");

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const session = sessionService.getSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Session expired",
      });
    }

    req.user = payload;
    req.session = session;
    req.token = token;

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
}

module.exports = {
  authMiddleware,
};