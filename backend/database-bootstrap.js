const fs = require("fs");
const path = require("path");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");

const SEED_PATH = path.join(__dirname, "seed-mahasiswa.csv");
const INSERT_BATCH_SIZE = 1000;
const COLUMNS = [
  "id",
  "no_bp",
  "angkatan",
  "nama_lengkap",
  "jenis_kelamin",
  "asal_sekolah",
  "alamat",
  "longitude",
  "latitude",
  "jalur_masuk",
];

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS mahasiswa (
      id INTEGER PRIMARY KEY,
      no_bp VARCHAR(20),
      angkatan INTEGER,
      nama_lengkap VARCHAR(150),
      jenis_kelamin VARCHAR(10),
      asal_sekolah VARCHAR(200),
      alamat TEXT,
      longitude NUMERIC(12,8),
      latitude NUMERIC(12,8),
      jalur_masuk VARCHAR(20) NULL
    )
  `);

  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS alamat TEXT");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS longitude NUMERIC(12,8)");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS latitude NUMERIC(12,8)");
  await client.query("CREATE INDEX IF NOT EXISTS mahasiswa_no_bp_idx ON mahasiswa (no_bp)");
  await client.query("CREATE INDEX IF NOT EXISTS mahasiswa_angkatan_idx ON mahasiswa (angkatan)");
}

function readSeedRows() {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`File seed mahasiswa tidak ditemukan: ${SEED_PATH}`);
  }

  const rows = parseMahasiswaCsv(fs.readFileSync(SEED_PATH, "utf8"));
  const incompleteRow = rows.find(
    (row) => !row.id || !row.no_bp || !row.alamat || row.longitude === null || row.latitude === null
  );

  if (incompleteRow) {
    throw new Error(`Seed mahasiswa tidak lengkap pada No BP ${incompleteRow.no_bp || "-"}`);
  }

  return rows;
}

async function upsertSeedBatch(client, rows) {
  const values = rows.flatMap((row) => COLUMNS.map((column) => row[column]));
  const placeholders = rows
    .map((row, rowIndex) => {
      const start = rowIndex * COLUMNS.length;
      return `(${COLUMNS.map((_, columnIndex) => `$${start + columnIndex + 1}`).join(", ")})`;
    })
    .join(", ");

  await client.query(
    `
      INSERT INTO mahasiswa (${COLUMNS.join(", ")})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET
        no_bp = COALESCE(NULLIF(mahasiswa.no_bp, ''), EXCLUDED.no_bp),
        angkatan = COALESCE(mahasiswa.angkatan, EXCLUDED.angkatan),
        nama_lengkap = COALESCE(NULLIF(mahasiswa.nama_lengkap, ''), EXCLUDED.nama_lengkap),
        jenis_kelamin = COALESCE(NULLIF(mahasiswa.jenis_kelamin, ''), EXCLUDED.jenis_kelamin),
        asal_sekolah = COALESCE(NULLIF(mahasiswa.asal_sekolah, ''), EXCLUDED.asal_sekolah),
        alamat = COALESCE(NULLIF(mahasiswa.alamat, ''), EXCLUDED.alamat),
        longitude = COALESCE(mahasiswa.longitude, EXCLUDED.longitude),
        latitude = COALESCE(mahasiswa.latitude, EXCLUDED.latitude),
        jalur_masuk = COALESCE(NULLIF(mahasiswa.jalur_masuk, ''), EXCLUDED.jalur_masuk)
    `,
    values
  );
}

async function initializeDatabase(pool) {
  const seedRows = readSeedRows();
  const client = await pool.connect();
  let seeded = 0;

  try {
    await client.query("BEGIN");
    await ensureSchema(client);

    const countResult = await client.query("SELECT COUNT(*) AS total FROM mahasiswa");

    if (Number(countResult.rows[0].total) === 0) {
      for (let startIndex = 0; startIndex < seedRows.length; startIndex += INSERT_BATCH_SIZE) {
        await upsertSeedBatch(client, seedRows.slice(startIndex, startIndex + INSERT_BATCH_SIZE));
      }

      seeded = seedRows.length;
    }

    await client.query("COMMIT");

    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
          WHERE NULLIF(TRIM(alamat), '') IS NOT NULL
            AND longitude IS NOT NULL
            AND latitude IS NOT NULL
        ) AS lengkap
      FROM mahasiswa
    `);

    return {
      seeded,
      total: Number(result.rows[0].total),
      complete: Number(result.rows[0].lengkap),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureSchema,
  initializeDatabase,
  readSeedRows,
};
