const express = require("express");
const router = express.Router();
const pool = require("../db");
const { jalurMasukSql } = require("../mahasiswa-utils");

router.get("/summary", async (req, res) => {
  try {
    const [totalResult, angkatanResult, jalurResult] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM mahasiswa"),
      pool.query(`
        SELECT angkatan, COUNT(*) AS total
        FROM mahasiswa
        GROUP BY angkatan
        ORDER BY angkatan
      `),
      pool.query(`
        SELECT ${jalurMasukSql} AS jalur_masuk, COUNT(*) AS total
        FROM mahasiswa
        GROUP BY 1
        ORDER BY total DESC, jalur_masuk ASC
      `),
    ]);

    res.json({
      totalMahasiswa: Number(totalResult.rows[0].total),
      trenAngkatan: angkatanResult.rows.map((row) => ({
        angkatan: row.angkatan,
        total: Number(row.total),
      })),
      jalurMasuk: jalurResult.rows.map((row) => ({
        jalur_masuk: row.jalur_masuk || "Belum tersedia",
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
    const result = await pool.query(`
      SELECT asal_sekolah, COUNT(*) AS total
      FROM mahasiswa
      WHERE asal_sekolah IS NOT NULL
        AND TRIM(asal_sekolah) <> ''
        AND TRIM(asal_sekolah) <> '-'
      GROUP BY asal_sekolah
      ORDER BY total DESC, asal_sekolah ASC
      LIMIT 10
    `);

    res.json(
      result.rows.map((row) => ({
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
