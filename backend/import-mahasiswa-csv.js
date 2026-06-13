const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { getAdminDatabaseConfig, getDatabaseConfig, getDatabaseName } = require("./db-config");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");

const DB_NAME = getDatabaseName();
const CSV_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "file_sql_asalmahasiswa.sql");
const INSERT_COLUMNS = [
  "id",
  "no_bp",
  "angkatan",
  "nama_lengkap",
  "jenis_kelamin",
  "asal_sekolah",
  "longitude",
  "latitude",
  "jalur_masuk",
];
const INSERT_BATCH_SIZE = 1000;

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function ensureDatabase() {
  const adminClient = new Client(getAdminDatabaseConfig());

  await adminClient.connect();

  const existing = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);

  if (existing.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(DB_NAME)}`);
  }

  await adminClient.end();
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`File CSV tidak ditemukan: ${CSV_PATH}`);
  }

  await ensureDatabase();

  const connection = new Client(getDatabaseConfig());

  await connection.connect();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mahasiswa (
      id INTEGER PRIMARY KEY,
      no_bp VARCHAR(20),
      angkatan INTEGER,
      nama_lengkap VARCHAR(150),
      jenis_kelamin VARCHAR(10),
      asal_sekolah VARCHAR(200),
      longitude NUMERIC(12,8),
      latitude NUMERIC(12,8),
      jalur_masuk VARCHAR(20) NULL
    )
  `);

  const csv = fs.readFileSync(CSV_PATH, "utf8").trim();
  const rows = parseMahasiswaCsv(csv).map((row) => INSERT_COLUMNS.map((column) => row[column]));

  await connection.query("DELETE FROM mahasiswa");

  for (let startIndex = 0; startIndex < rows.length; startIndex += INSERT_BATCH_SIZE) {
    const batch = rows.slice(startIndex, startIndex + INSERT_BATCH_SIZE);
    const values = batch.flat();
    const placeholders = batch
      .map((row, rowIndex) => {
        const rowPlaceholders = row.map((_, columnIndex) => `$${rowIndex * row.length + columnIndex + 1}`);
        return `(${rowPlaceholders.join(", ")})`;
      })
      .join(", ");

    await connection.query(
      `
        INSERT INTO mahasiswa
        (${INSERT_COLUMNS.join(", ")})
        VALUES ${placeholders}
      `,
      values
    );
  }

  const countResult = await connection.query("SELECT COUNT(*) AS total FROM mahasiswa");
  console.log(`Import berhasil: ${countResult.rows[0].total} data dari ${CSV_PATH} masuk ke database ${DB_NAME}.`);

  await connection.end();
}

main().catch((error) => {
  console.error("Import gagal:", error.message);
  process.exit(1);
});
