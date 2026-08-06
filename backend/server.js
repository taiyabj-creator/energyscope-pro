require("dotenv").config();

const express = require("express");
const cors = require("cors");

const chartsRouter = require("./routes/charts");
const configRouter = require("./routes/config");
const plantRouter = require("./routes/plant");
const inverterRouter = require("./routes/inverter");
const exportRouter = require("./routes/export");
const predictionRouter = require("./routes/prediction");
const maintenanceRouter = require("./routes/maintenance");
const authRouter = require("./routes/auth");
const { authMiddleware } = require("./middleware/auth");
const app = express();

app.use(cors());
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

app.use("/api", configRouter);
app.use("/api/auth", authRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});