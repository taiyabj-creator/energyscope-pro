require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { login } = require("./services/utlApi");
const chartsRouter = require("./routes/charts");
const configRouter = require("./routes/config");
const plantRouter = require("./routes/plant");
const inverterRouter = require("./routes/inverter");

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

app.use("/api/charts", chartsRouter);
app.use("/api", configRouter);
app.use("/api/inverter", inverterRouter);
app.use("/api/plant", plantRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  login()
    .then(() => console.log("✓ Login completed"))
    .catch(console.error);
});