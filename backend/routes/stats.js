const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/summary", async (req, res) => {
  try {
    const [totalRows] = await pool.query("SELECT COUNT(*) AS total FROM mahasiswa");
    const [angkatanRows] = await pool.query(`
      SELECT angkatan, COUNT(*) AS total
      FROM mahasiswa
      GROUP BY angkatan
      ORDER BY angkatan
    `);

    res.json({
      totalMahasiswa: Number(totalRows[0].total),
      trenAngkatan: angkatanRows.map((row) => ({
        angkatan: row.angkatan,
        total: Number(row.total),
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil statistik",
      error: error.message,
    });
  }
});

router.get("/ranking-daerah", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT asal_sekolah, COUNT(*) AS total
      FROM mahasiswa
      GROUP BY asal_sekolah
      ORDER BY total DESC, asal_sekolah ASC
      LIMIT 10
    `);

    res.json(
      rows.map((row) => ({
        asal_sekolah: row.asal_sekolah,
        total: Number(row.total),
      }))
    );
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil ranking daerah",
      error: error.message,
    });
  }
});

module.exports = router;
