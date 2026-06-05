const express = require("express");
const cors = require("cors");
const path = require("path");
const mahasiswaRoutes = require("./routes/mahasiswa");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.use("/api/mahasiswa", mahasiswaRoutes);
app.use("/api/stats", statsRoutes);

app.listen(PORT, () => {
  console.log(`AsalSI WebGIS backend running on port ${PORT}`);
});
