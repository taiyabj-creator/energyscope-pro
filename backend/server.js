require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { login } = require("./services/utlApi");
const { cleanupExpiredSessions } = require("./services/sessionService");

const chartsRouter = require("./routes/charts");
const configRouter = require("./routes/config");
const plantRouter = require("./routes/plant");
const inverterRouter = require("./routes/inverter");
const exportRouter = require("./routes/export");
const predictionRouter = require("./routes/prediction");
const maintenanceRouter = require("./routes/maintenance");
const archiveRouter = require("./routes/archive");
const authRouter = require("./routes/auth");
const healthRouter = require("./routes/health");
const notificationsRouter = require("./routes/notifications");
const aiRouter = require("./routes/ai");
const { createMonitor } = require("./services/notificationMonitor");
const { authMiddleware } = require("./middleware/auth");
const requiredEnv = ["JWT_SECRET"];

for (const variable of requiredEnv) {
  if (!process.env[variable]) {
    console.error(`Missing required environment variable: ${variable}`);
    process.exit(1);
  }
}
const app = express();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://192.168.29.58:8080",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-device-id"],
  }),
);
app.use(helmet());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend Running",
  });
});

// Log every request
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use("/api/charts", authMiddleware, chartsRouter);
app.use("/api/inverter", authMiddleware, inverterRouter);
app.use("/api/plant", authMiddleware, plantRouter);
app.use("/api/export", authMiddleware, exportRouter);
app.use("/api/prediction", authMiddleware, predictionRouter);
app.use("/api/maintenance", authMiddleware, maintenanceRouter);
app.use("/api/archive", authMiddleware, archiveRouter);
app.use("/api/notifications", authMiddleware, notificationsRouter);
app.use("/api/ai", authMiddleware, aiRouter);

app.use("/api/health", healthRouter);
app.use("/api", configRouter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  cleanupExpiredSessions();

  setInterval(
    () => {
      cleanupExpiredSessions();
    },
    30 * 60 * 1000,
  );

  // Startup login removed.
  // Authentication is performed through /api/auth/login when users sign in.

  // Background push-notification monitor runs inside this existing
  // long-running process (no second server). It degrades to state-tracking
  // only when VAPID is not configured; subscriptions simply receive nothing.
  try {
    createMonitor().start();
  } catch (err) {
    console.error(`Notification monitor failed to start: ${err.message}`);
  }
});
