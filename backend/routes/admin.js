const express = require("express");
const pool = require("../db");
const {
  jalurMasukSql,
  normalizeMahasiswaRow,
  parseMahasiswaCsv,
  validateMahasiswa,
} = require("../mahasiswa-utils");
const { requireAdmin } = require("./auth");
const { geocodeAddress, geocodeMahasiswaRows } = require("../geocoding");
const { parseMahasiswaWorkbook } = require("../excel-utils");

const router = express.Router();

router.use(requireAdmin);

async function ensureMahasiswaAlamatColumn() {
  await pool.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS alamat TEXT");
}

function buildSearchFilter(query) {
  const values = [];
  let whereClause = "";

  if (query.search) {
    values.push(`%${query.search.trim()}%`);
    whereClause = `
      WHERE nama_lengkap ILIKE $1
         OR no_bp ILIKE $1
         OR asal_sekolah ILIKE $1
         OR ${jalurMasukSql} ILIKE $1
    `;
  }

  return { values, whereClause };
}

async function getNextId(client) {
  const result = await client.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM mahasiswa");
  return Number(result.rows[0].next_id);
}

async function upsertMahasiswaRows(client, rows) {
  if (rows.length === 0) {
    return 0;
  }

  let nextId = await getNextId(client);
  const normalizedRows = rows.map((row) => {
    if (!row.id) {
      row.id = nextId;
      nextId += 1;
    }

    return row;
  });

  const values = normalizedRows.flatMap((row) => [
    row.id,
    row.no_bp,
    row.angkatan,
    row.nama_lengkap,
    row.jenis_kelamin,
    row.asal_sekolah,
    row.alamat || null,
    row.longitude,
    row.latitude,
    row.jalur_masuk,
  ]);
  const placeholders = normalizedRows
    .map((row, rowIndex) => {
      const start = rowIndex * 10;
      return `(${Array.from({ length: 10 }, (_, columnIndex) => `$${start + columnIndex + 1}`).join(", ")})`;
    })
    .join(", ");

  const result = await client.query(
    `
      INSERT INTO mahasiswa
      (id, no_bp, angkatan, nama_lengkap, jenis_kelamin, asal_sekolah, alamat, longitude, latitude, jalur_masuk)
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET
        no_bp = EXCLUDED.no_bp,
        angkatan = EXCLUDED.angkatan,
        nama_lengkap = EXCLUDED.nama_lengkap,
        jenis_kelamin = EXCLUDED.jenis_kelamin,
        asal_sekolah = EXCLUDED.asal_sekolah,
        alamat = EXCLUDED.alamat,
        longitude = EXCLUDED.longitude,
        latitude = EXCLUDED.latitude,
        jalur_masuk = EXCLUDED.jalur_masuk
    `,
    values
  );

  return result.rowCount;
}

router.get("/dashboard", async (req, res) => {
  try {
    await ensureMahasiswaAlamatColumn();
    const [summaryResult, jalurResult, recentResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE longitude IS NOT NULL AND latitude IS NOT NULL) AS terpetakan,
          COUNT(DISTINCT angkatan) AS total_angkatan
        FROM mahasiswa
      `),
      pool.query(`
        SELECT COALESCE(${jalurMasukSql}, 'Belum tersedia') AS jalur_masuk, COUNT(*) AS total
        FROM mahasiswa
        GROUP BY 1
        ORDER BY total DESC
      `),
      pool.query(`
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, alamat, longitude, latitude, ${jalurMasukSql} AS jalur_masuk
        FROM mahasiswa
        ORDER BY id DESC
        LIMIT 8
      `),
    ]);

    const summary = summaryResult.rows[0];

    res.json({
      totalMahasiswa: Number(summary.total),
      totalTerpetakan: Number(summary.terpetakan),
      totalAngkatan: Number(summary.total_angkatan),
      perJalur: jalurResult.rows.map((row) => ({
        jalur_masuk: row.jalur_masuk,
        total: Number(row.total),
      })),
      terbaru: recentResult.rows,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil dashboard admin",
      error: error.message,
    });
  }
});

router.get("/mahasiswa", async (req, res) => {
  try {
    await ensureMahasiswaAlamatColumn();
    const limit = Math.min(Number(req.query.limit || 100), 300);
    const { values, whereClause } = buildSearchFilter(req.query);
    values.push(limit);

    const result = await pool.query(
      `
        SELECT id, no_bp, angkatan, nama_lengkap, jenis_kelamin,
               asal_sekolah, alamat, longitude, latitude, ${jalurMasukSql} AS jalur_masuk
        FROM mahasiswa
        ${whereClause}
        ORDER BY id DESC
        LIMIT $${values.length}
      `,
      values
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data admin mahasiswa",
      error: error.message,
    });
  }
});

router.post("/geocode", async (req, res) => {
  const alamat = String(req.body?.alamat || "").trim();

  if (!alamat) {
    res.status(400).json({ message: "Alamat wajib diisi sebelum geocoding" });
    return;
  }

  try {
    const coordinates = await geocodeAddress(alamat);

    if (!coordinates) {
      res.status(422).json({ message: "Alamat tidak ditemukan oleh layanan geocoding" });
      return;
    }

    res.json(coordinates);
  } catch (error) {
    res.status(502).json({
      message: "Gagal melakukan geocoding alamat",
      error: error.message,
    });
  }
});

router.post("/mahasiswa", async (req, res) => {
  const row = normalizeMahasiswaRow(req.body || {});
  const errors = validateMahasiswa(row);

  if (errors.length > 0) {
    res.status(400).json({ message: "Data mahasiswa belum valid", errors });
    return;
  }

  try {
    await ensureMahasiswaAlamatColumn();
    const result = await geocodeMahasiswaRows([{ row, rowNumber: 1 }]);

    if (result.rejectedRows.length > 0) {
      res.status(422).json({
        message: "Alamat tidak dapat diterjemahkan menjadi koordinat",
        errors: result.rejectedRows[0].errors,
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await upsertMahasiswaRows(client, result.rows);
      await client.query("COMMIT");

      res.status(201).json({
        message: "Data mahasiswa berhasil disimpan",
        geocoded: result.geocoded,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(502).json({
      message: "Gagal melakukan geocoding atau menyimpan data mahasiswa",
      error: error.message,
    });
  }
});

router.post("/mahasiswa/import", async (req, res) => {
  let rows;
  let sourceSheet = null;

  try {
    await ensureMahasiswaAlamatColumn();
    if (req.body?.excelBase64) {
      const parsedWorkbook = await parseMahasiswaWorkbook(Buffer.from(req.body.excelBase64, "base64"));
      rows = parsedWorkbook.rows;
      sourceSheet = parsedWorkbook.sheetName;
    } else {
      rows = parseMahasiswaCsv(req.body?.csv);
    }
  } catch (error) {
    res.status(400).json({
      message: "File Excel tidak dapat dibaca",
      error: error.message,
    });
    return;
  }

  const validRows = [];
  const rejectedRows = [];

  rows.forEach((row, index) => {
    const errors = validateMahasiswa(row);

    if (errors.length > 0) {
      rejectedRows.push({ rowNumber: index + 1, errors });
      return;
    }

    validRows.push({ row, rowNumber: index + 1 });
  });

  if (validRows.length === 0) {
    res.status(400).json({
      message: "Tidak ada baris CSV yang valid",
      rejectedRows: rejectedRows.slice(0, 20),
    });
    return;
  }

  try {
    const geocodingResult = await geocodeMahasiswaRows(validRows);
    rejectedRows.push(...geocodingResult.rejectedRows);

    if (geocodingResult.rows.length === 0) {
      res.status(422).json({
        message: "Tidak ada baris yang berhasil di-geocoding",
        rejectedRows: rejectedRows.slice(0, 20),
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const imported = await upsertMahasiswaRows(client, geocodingResult.rows);
      await client.query("COMMIT");

      res.json({
        message: "Import CSV dan geocoding berhasil",
        imported,
        approximate: geocodingResult.approximate,
        fallback: geocodingResult.fallback,
        geocoded: geocodingResult.geocoded,
        sourceSheet,
        rejected: rejectedRows.length,
        rejectedRows: rejectedRows.slice(0, 20),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(502).json({
      message: "Gagal melakukan geocoding atau import CSV",
      error: error.message,
    });
  }
});

module.exports = router;
