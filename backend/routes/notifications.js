/**
 * Web Push notification routes.
 *
 * All routes sit behind the standard authMiddleware. Subscription secrets
 * are accepted, stored, and NEVER logged or echoed back.
 *
 * The /test endpoints exist ONLY outside production (NODE_ENV !==
 * "production") so real deployments cannot trigger simulated pushes even
 * with a valid session. Authentication is never weakened for them.
 */

const express = require("express");
const router = express.Router();
const pushService = require("../services/pushService");
const notificationMonitor = require("../services/notificationMonitor");

const IS_DEV = process.env.NODE_ENV !== "production";

router.get("/vapid-public", (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({
      success: false,
      message: "Push notifications are not configured on this server.",
    });
  }
  res.json({ success: true, publicKey });
});

router.post("/subscribe", (req, res) => {
  try {
    const { subscription } = req.body || {};
    pushService.saveSubscription(req.user?.email ?? "unknown", subscription);
    res.json({
      success: true,
      subscribed: pushService.countForEmail(req.user?.email ?? "unknown"),
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post("/unsubscribe", (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string") {
    return res.status(400).json({ success: false, message: "endpoint required" });
  }
  // Only remove subscriptions belonging to this authenticated user's rows.
  const db = require("../data/notificationDatabase");
  const row = db.prepare("SELECT email FROM push_subscriptions WHERE endpoint = ?").get(endpoint);
  if (row && row.email !== req.user?.email) {
    return res.status(403).json({ success: false, message: "Not your subscription." });
  }
  pushService.removeSubscription(endpoint);
  res.json({ success: true, subscribed: pushService.countForEmail(req.user?.email ?? "unknown") });
});

router.get("/status", (req, res) => {
  res.json({
    success: true,
    configured: Boolean(process.env.VAPID_PUBLIC_KEY),
    subscribed: pushService.countForEmail(req.user?.email ?? "unknown"),
  });
});

// In-app notification center feed (7-day retention enforced server-side).
router.get("/recent", (req, res) => {
  try {
    const items = pushService.listNotifications({ limit: req.query.limit });
    res.json({
      success: true,
      data: items.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        url: row.url,
        read: !!row.read,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    console.error("[NOTIFICATIONS] recent error:", err.message);
    res.status(500).json({ success: false, message: "Notification feed unavailable." });
  }
});

router.post("/read", (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(Number(n))) : null;
    const updated = pushService.markNotificationsRead({ ids });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not mark notifications read." });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const dismissed = pushService.dismissNotification(req.params.id);
    if (!dismissed) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not dismiss notification." });
  }
});

if (IS_DEV) {
  /** Simulate an inverter transition push without waiting for reality. */
  router.post("/test/:kind", async (req, res) => {
    const kind = String(req.params.kind);
    if (kind === "online" || kind === "offline") {
      const detectedAt = notificationMonitor.istTimeString(new Date());
      await pushService.broadcast({
        kind: kind === "online" ? "inverter_online" : "inverter_offline",
        title:
          kind === "online" ? "EnergyScope — Inverter Online" : "EnergyScope — Inverter Offline",
        body:
          kind === "online"
            ? `${process.env.NOTIFY_PLANT_NAME || "The plant"} inverter is back online and producing power. Transition detected at ${detectedAt}.`
            : `${process.env.NOTIFY_PLANT_NAME || "The plant"} inverter went offline at ${detectedAt}. EnergyScope will continue monitoring its status.`,
        url: kind === "online" ? "/" : "/diagnostics",
      });
      return res.json({ success: true, sent: kind });
    }
    if (kind === "summary") {
      try {
        const payload = await notificationMonitor.buildDailySummaryPayload({});
        if (!payload) {
          return res
            .status(409)
            .json({ success: false, message: "No usable data for today's summary." });
        }
        await pushService.broadcast(payload);
        return res.json({ success: true, sent: "summary", payload });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    }

    res.status(400).json({ success: false, message: "kind must be online | offline | summary" });
  });
}

module.exports = router;
