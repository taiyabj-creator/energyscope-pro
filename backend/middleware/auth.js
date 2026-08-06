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

  console.log("JWT:", token.substring(0, 40));

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const session = sessionService.getSession(token);

    console.log("Session lookup:", session);

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