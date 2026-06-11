const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { getAdminDatabaseConfig, getDatabaseConfig, getDatabaseName } = require("./db-config");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");

const DB_NAME = getDatabaseName();
const CSV_PATH = path.join(__dirname, "file_sql_asalmahasiswa.sql");

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
  const rows = parseMahasiswaCsv(csv).map((row) => [
    row.id,
    row.no_bp,
    row.angkatan,
    row.nama_lengkap,
    row.jenis_kelamin,
    row.asal_sekolah,
    row.longitude,
    row.latitude,
    row.jalur_masuk,
  ]);

  await connection.query("DELETE FROM mahasiswa");
  const values = rows.flat();
  const placeholders = rows
    .map((row, rowIndex) => {
      const rowPlaceholders = row.map((_, columnIndex) => `$${rowIndex * row.length + columnIndex + 1}`);
      return `(${rowPlaceholders.join(", ")})`;
    })
    .join(", ");

  await connection.query(
    `
      INSERT INTO mahasiswa
      (id, no_bp, angkatan, nama_lengkap, jenis_kelamin, asal_sekolah, longitude, latitude, jalur_masuk)
      VALUES ${placeholders}
    `,
    values
  );

  const countResult = await connection.query("SELECT COUNT(*) AS total FROM mahasiswa");
  console.log(`Import berhasil: ${countResult.rows[0].total} data masuk ke database ${DB_NAME}.`);

  await connection.end();
}

main().catch((error) => {
  console.error("Import gagal:", error.message);
  process.exit(1);
});
