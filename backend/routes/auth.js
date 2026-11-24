const express = require("express");
const authController = require("../controllers/authController");
const { authMiddleware } = require("../middleware/auth");
const userProfileService = require("../services/userProfileService");

const router = express.Router();

router.post("/login", authController.login);
router.post("/logout", authMiddleware, authController.logout);

// Live owner identity for the signed-in account, read from the UTL portal.
// Display-only: the service degrades to a cached profile or null fields rather
// than failing the dashboard when the upstream call is unavailable.
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const profile = await userProfileService.getProfile(req.token, req.session);
    return res.json({ success: true, data: profile });
  } catch (err) {
    console.error("[AUTH] profile error:", err.message);
    return res.status(500).json({ success: false, error: "PROFILE_UNAVAILABLE" });
  }
});

module.exports = router;
