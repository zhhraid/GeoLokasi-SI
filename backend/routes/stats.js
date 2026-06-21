const express = require("express");
const router = express.Router();
const pool = require("../db");
const { jalurMasukSql } = require("../mahasiswa-utils");

function normalizeRegionValue(value, fallback = "Belum tersedia") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function mapToSortedRows(map, labelKey, limit = 10) {
  return [...map.entries()]
    .map(([label, total]) => ({ [labelKey]: label, total }))
    .sort((a, b) =>
      Number(b.total) - Number(a.total)
      || String(a[labelKey]).localeCompare(String(b[labelKey])),
    )
    .slice(0, limit);
}

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

router.get("/wilayah-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT provinsi, kota_kabupaten, ${jalurMasukSql} AS jalur_masuk
      FROM mahasiswa
    `);

    const provinceCounts = new Map();
    const cityCounts = new Map();
    const jalurCityCounts = new Map();
    let wilayahTerisi = 0;
    let sumbarTotal = 0;
    let luarSumbarTotal = 0;

    result.rows.forEach((row) => {
      const province = normalizeRegionValue(row.provinsi, "");
      const city = normalizeRegionValue(row.kota_kabupaten, "");
      const jalur = row.jalur_masuk || "Belum tersedia";

      if (!province || !city) {
        return;
      }

      wilayahTerisi += 1;
      addCount(provinceCounts, province);
      addCount(cityCounts, city);

      if (province === "Sumatera Barat") {
        sumbarTotal += 1;
      } else {
        luarSumbarTotal += 1;
      }

      if (!jalurCityCounts.has(jalur)) {
        jalurCityCounts.set(jalur, new Map());
      }
      addCount(jalurCityCounts.get(jalur), city);
    });

    const jalurDominanWilayah = [...jalurCityCounts.entries()]
      .map(([jalur_masuk, cityMap]) => {
        const topCity = mapToSortedRows(cityMap, "wilayah", 1)[0];

        return {
          jalur_masuk,
          wilayah: topCity?.wilayah || "Belum tersedia",
          total: Number(topCity?.total || 0),
        };
      })
      .sort((a, b) =>
        Number(b.total) - Number(a.total)
        || a.jalur_masuk.localeCompare(b.jalur_masuk),
      );

    res.json({
      totalMahasiswa: result.rows.length,
      wilayahTerisi: {
        total: wilayahTerisi,
        persentase: result.rows.length ? (wilayahTerisi / result.rows.length) * 100 : 0,
      },
      provinsi: mapToSortedRows(provinceCounts, "provinsi", 8),
      kotaKabupaten: mapToSortedRows(cityCounts, "wilayah", 10),
      sumbarVsLuar: [
        { kategori: "Sumatera Barat", total: sumbarTotal },
        { kategori: "Luar Sumatera Barat", total: luarSumbarTotal },
      ],
      jalurDominanWilayah,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil statistik wilayah",
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
