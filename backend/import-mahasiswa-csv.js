const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "asalsi_webgis";
const CSV_PATH = path.join(__dirname, "file_sql_asalmahasiswa.sql");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuote && nextChar === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === "," && !insideQuote) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function normalizeLongitude(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const sign = value.startsWith("-") ? -1 : 1;
  const digits = value.replace("-", "").replace(".", "");
  const integerDigits = digits.startsWith("1") ? 3 : 2;
  const normalized = `${digits.slice(0, integerDigits)}.${digits.slice(integerDigits)}`;

  return Number(normalized) * sign;
}

function normalizeLatitude(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const sign = value.startsWith("-") ? -1 : 1;
  const digits = value.replace("-", "").replace(".", "").padStart(8, "0");
  const normalized = `${digits.slice(0, -7) || "0"}.${digits.slice(-7)}`;

  return Number(normalized) * sign;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await connection.query(`USE \`${DB_NAME}\``);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mahasiswa (
      id INT PRIMARY KEY,
      no_bp VARCHAR(20),
      angkatan INT,
      nama_lengkap VARCHAR(150),
      jenis_kelamin VARCHAR(10),
      asal_sekolah VARCHAR(200),
      longitude DECIMAL(12,8),
      latitude DECIMAL(12,8),
      jalur_masuk VARCHAR(20) NULL
    )
  `);

  const csv = fs.readFileSync(CSV_PATH, "utf8").trim();
  const lines = csv.split(/\r?\n/);
  const rows = lines.slice(1).map(parseCsvLine).map((columns) => [
    Number(columns[0]),
    columns[1],
    Number(columns[2]),
    columns[3],
    columns[4],
    columns[5],
    normalizeLongitude(columns[6]),
    normalizeLatitude(columns[7]),
    null,
  ]);

  await connection.query("DELETE FROM mahasiswa");
  await connection.query(
    `
      INSERT INTO mahasiswa
      (id, no_bp, angkatan, nama_lengkap, jenis_kelamin, asal_sekolah, longitude, latitude, jalur_masuk)
      VALUES ?
    `,
    [rows]
  );

  const [countRows] = await connection.query("SELECT COUNT(*) AS total FROM mahasiswa");
  console.log(`Import berhasil: ${countRows[0].total} data masuk ke database ${DB_NAME}.`);

  await connection.end();
}

main().catch((error) => {
  console.error("Import gagal:", error.message);
  process.exit(1);
});
