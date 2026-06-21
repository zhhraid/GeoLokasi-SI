const fs = require("fs");
const path = require("path");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");
const { hashPassword } = require("./password-utils");

const SEED_PATH = path.join(__dirname, "seed-mahasiswa.csv");
const WILAYAH_UPDATE_PATH = path.join(__dirname, "update_wilayah_mahasiswa.sql");
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
  "provinsi",
  "kota_kabupaten",
];
const USER_SEEDS = [
  { email: "admin@gmail.com", password: "admin123", role: "admin", name: "Admin", nim: null },
  {
    email: "2311521006_nayla@student.unand.ac.id",
    password: "2311521006",
    role: "user",
    name: "Nayla",
    nim: "2311521006",
  },
  {
    email: "2311523006_zhahra@student.unand.ac.id",
    password: "2311523006",
    role: "user",
    name: "Zhahra",
    nim: "2311523006",
  },
  {
    email: "2311523032_della@student.unand.ac.id",
    password: "2311523032",
    role: "user",
    name: "Della",
    nim: "2311523032",
  },
  {
    email: "2311522010_kezia@student.unand.ac.id",
    password: "2311522010",
    role: "user",
    name: "Kezia",
    nim: "2311522010",
  },
  {
    email: "2311522028_mashia@student.unand.ac.id",
    password: "2311522028",
    role: "user",
    name: "Mashia",
    nim: "2311522028",
  },
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
      jalur_masuk VARCHAR(20) NULL,
      provinsi TEXT,
      kota_kabupaten TEXT
    )
  `);

  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS alamat TEXT");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS longitude NUMERIC(12,8)");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS latitude NUMERIC(12,8)");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS provinsi TEXT");
  await client.query("ALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS kota_kabupaten TEXT");
  await client.query("CREATE INDEX IF NOT EXISTS mahasiswa_no_bp_idx ON mahasiswa (no_bp)");
  await client.query("CREATE INDEX IF NOT EXISTS mahasiswa_angkatan_idx ON mahasiswa (angkatan)");

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      name VARCHAR(150) NOT NULL,
      nim VARCHAR(20) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query("CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)");
}

async function seedUsers(client) {
  for (const user of USER_SEEDS) {
    await client.query(
      `
        INSERT INTO users (email, password_hash, role, name, nim)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          name = EXCLUDED.name,
          nim = EXCLUDED.nim,
          updated_at = CURRENT_TIMESTAMP
      `,
      [user.email, hashPassword(user.password), user.role, user.name, user.nim]
    );
  }
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
        jalur_masuk = COALESCE(NULLIF(mahasiswa.jalur_masuk, ''), EXCLUDED.jalur_masuk),
        provinsi = COALESCE(NULLIF(mahasiswa.provinsi, ''), EXCLUDED.provinsi),
        kota_kabupaten = COALESCE(NULLIF(mahasiswa.kota_kabupaten, ''), EXCLUDED.kota_kabupaten)
    `,
    values
  );
}

async function applyWilayahUpdate(client) {
  if (!fs.existsSync(WILAYAH_UPDATE_PATH)) {
    return false;
  }

  await client.query(fs.readFileSync(WILAYAH_UPDATE_PATH, "utf8"));
  return true;
}

async function initializeDatabase(pool) {
  const seedRows = readSeedRows();
  const client = await pool.connect();
  let seeded = 0;

  try {
    await client.query("BEGIN");
    await ensureSchema(client);
    await seedUsers(client);

    const countResult = await client.query("SELECT COUNT(*) AS total FROM mahasiswa");

    if (Number(countResult.rows[0].total) === 0) {
      for (let startIndex = 0; startIndex < seedRows.length; startIndex += INSERT_BATCH_SIZE) {
        await upsertSeedBatch(client, seedRows.slice(startIndex, startIndex + INSERT_BATCH_SIZE));
      }

      seeded = seedRows.length;
    }

    await applyWilayahUpdate(client);

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
  seedUsers,
};
