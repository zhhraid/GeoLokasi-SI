const express = require("express");
const cors = require("cors");
const path = require("path");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const mahasiswaRoutes = require("./routes/mahasiswa");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.use("/api/auth", authRoutes.router);
app.use("/api/admin", adminRoutes);
app.use("/api/mahasiswa", mahasiswaRoutes);
app.use("/api/stats", statsRoutes);

app.listen(PORT, () => {
  console.log(`AsalSI WebGIS backend running on port ${PORT}`);
});
