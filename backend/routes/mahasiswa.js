const express = require("express");
const router = express.Router();

async function ensureMahasiswaAlamatColumn() {
  await pool.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS alamat TEXT");
}
const pool = require("../db");
const { jalurMasukSql } = require("../mahasiswa-utils");

function buildMahasiswaFilters(query) {
  const filters = [];
  const values = [];

  if (query.angkatan) {
    values.push(query.angkatan);
    filters.push(`angkatan = $${values.length}`);
  }

  if (query.jalur) {
    const jalurValues = Array.isArray(query.jalur) ? query.jalur : [query.jalur];
    const placeholders = jalurValues.map((jalur) => {
      values.push(jalur);
      return `$${values.length}`;
    });

    filters.push(`${jalurMasukSql} IN (${placeholders.join(", ")})`);
  }

  if (query.search) {
    values.push(`%${query.search.trim()}%`);
    filters.push(`(
      nama_lengkap ILIKE $${values.length}
      OR no_bp ILIKE $${values.length}
      OR asal_sekolah ILIKE $${values.length}
      OR ${jalurMasukSql} ILIKE $${values.length}
    )`);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    values,
  };
}

router.get("/", async (req, res) => {
  try {
    await ensureMahasiswaAlamatColumn();
    const { whereClause, values } = buildMahasiswaFilters(req.query);
    const result = await pool.query(
      `
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, alamat, longitude, latitude, ${jalurMasukSql} AS jalur_masuk
        FROM mahasiswa
        ${whereClause}
        ORDER BY angkatan DESC, nama_lengkap ASC
      `,
      values
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data mahasiswa",
      error: error.message,
    });
  }
});

router.get("/geojson", async (req, res) => {
  try {
    await ensureMahasiswaAlamatColumn();
    const { whereClause, values } = buildMahasiswaFilters(req.query);
    const result = await pool.query(
      `
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, alamat, longitude, latitude, ${jalurMasukSql} AS jalur_masuk
        FROM mahasiswa
        ${whereClause}
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        ORDER BY angkatan DESC, nama_lengkap ASC
      `.replace(`${whereClause}\n        WHERE`, whereClause ? `${whereClause} AND` : "WHERE"),
      values
    );

    res.json({
      type: "FeatureCollection",
      features: result.rows.map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(row.longitude), Number(row.latitude)],
        },
        properties: {
          id: row.id,
          no_bp: row.no_bp,
          angkatan: row.angkatan,
          nama_lengkap: row.nama_lengkap,
          jenis_kelamin: row.jenis_kelamin,
          asal_sekolah: row.asal_sekolah,
          alamat: row.alamat,
          longitude: Number(row.longitude),
          latitude: Number(row.latitude),
          jalur_masuk: row.jalur_masuk,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data GeoJSON mahasiswa",
      error: error.message,
    });
  }
});

router.get("/heatmap", async (req, res) => {
  try {
    const { whereClause, values } = buildMahasiswaFilters(req.query);
    const result = await pool.query(
      `
        SELECT latitude, longitude, COUNT(*) AS intensity
        FROM mahasiswa
        ${whereClause}
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        GROUP BY latitude, longitude
      `.replace(`${whereClause}\n        WHERE`, whereClause ? `${whereClause} AND` : "WHERE"),
      values
    );

    res.json(
      result.rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        intensity: Number(row.intensity),
      }))
    );
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data heatmap mahasiswa",
      error: error.message,
    });
  }
});

module.exports = router;
