const express = require("express");
const cors = require("cors");
const profilesRouter = require("./routes/profiles");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────
app.use(cors({ origin: "*" }));                 // Required by grading script
app.use(express.json());

// Ensure Access-Control-Allow-Origin is always present (belt-and-suspenders)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ── Routes ────────────────────────────────────
app.use("/api/profiles", profilesRouter);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "HNG14 Stage 1 API is running" });
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
