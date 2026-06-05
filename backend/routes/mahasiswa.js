const express = require("express");
const router = express.Router();
const pool = require("../db");

function buildMahasiswaFilters(query) {
  const filters = [];
  const values = [];

  if (query.angkatan) {
    filters.push("angkatan = ?");
    values.push(query.angkatan);
  }

  if (query.jalur) {
    const jalurValues = Array.isArray(query.jalur) ? query.jalur : [query.jalur];
    filters.push(`(jalur_masuk IN (${jalurValues.map(() => "?").join(", ")}) OR jalur_masuk IS NULL)`);
    values.push(...jalurValues);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    values,
  };
}

router.get("/", async (req, res) => {
  try {
    const { whereClause, values } = buildMahasiswaFilters(req.query);
    const [rows] = await pool.query(
      `
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, longitude, latitude, jalur_masuk
        FROM mahasiswa
        ${whereClause}
        ORDER BY angkatan DESC, nama_lengkap ASC
      `,
      values
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data mahasiswa",
      error: error.message,
    });
  }
});

router.get("/geojson", async (req, res) => {
  try {
    const { whereClause, values } = buildMahasiswaFilters(req.query);
    const [rows] = await pool.query(
      `
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, longitude, latitude, jalur_masuk
        FROM mahasiswa
        ${whereClause}
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        ORDER BY angkatan DESC, nama_lengkap ASC
      `.replace(`${whereClause}\n        WHERE`, whereClause ? `${whereClause} AND` : "WHERE"),
      values
    );

    res.json({
      type: "FeatureCollection",
      features: rows.map((row) => ({
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
    const [rows] = await pool.query(
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
      rows.map((row) => ({
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
