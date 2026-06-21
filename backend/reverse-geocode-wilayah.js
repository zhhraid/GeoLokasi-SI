const fs = require("fs");
const path = require("path");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");

const SEED_PATH = path.join(__dirname, "seed-mahasiswa.csv");
const OUTPUT_SQL_PATH = path.join(__dirname, "update_wilayah_mahasiswa.sql");
const CACHE_PATH = path.join(__dirname, "wilayah-geocode-cache.json");
const REQUEST_DELAY_MS = Number(process.env.REVERSE_GEOCODE_DELAY_MS || 1100);
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "GeoSIS-Unand-WebGIS/1.0 academic reverse geocoding";

const PROVINCE_ALIASES = new Map([
  ["west sumatra", "Sumatera Barat"],
  ["sumatera barat", "Sumatera Barat"],
  ["riau", "Riau"],
  ["jambi", "Jambi"],
  ["north sumatra", "Sumatera Utara"],
  ["sumatera utara", "Sumatera Utara"],
  ["bengkulu", "Bengkulu"],
  ["jakarta", "DKI Jakarta"],
  ["special capital region of jakarta", "DKI Jakarta"],
  ["dki jakarta", "DKI Jakarta"],
  ["aceh", "Aceh"],
  ["south sumatra", "Sumatera Selatan"],
  ["sumatera selatan", "Sumatera Selatan"],
  ["lampung", "Lampung"],
  ["riau islands", "Kepulauan Riau"],
  ["kepulauan riau", "Kepulauan Riau"],
  ["west java", "Jawa Barat"],
  ["jawa barat", "Jawa Barat"],
  ["central java", "Jawa Tengah"],
  ["jawa tengah", "Jawa Tengah"],
  ["east java", "Jawa Timur"],
  ["jawa timur", "Jawa Timur"],
  ["banten", "Banten"],
  ["bali", "Bali"],
  ["yogyakarta", "DI Yogyakarta"],
  ["special region of yogyakarta", "DI Yogyakarta"],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanName(value) {
  return String(value || "")
    .replace(/\b(regency|city|municipality|province|provinsi|kabupaten|kota)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProvince(value, address = {}) {
  if (address["ISO3166-2-lvl4"] === "ID-JK") {
    return "DKI Jakarta";
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return PROVINCE_ALIASES.get(normalized) || titleCase(value);
}

function normalizeKnownAdministrativeName(value) {
  const normalized = String(value || "").trim();
  const aliases = new Map([
    ["Kota Lima Puluh", "Kabupaten Lima Puluh Kota"],
    ["Kabupaten Lima Puluh", "Kabupaten Lima Puluh Kota"],
    ["Lima Puluh", "Kabupaten Lima Puluh Kota"],
    ["Solok Selatan", "Kabupaten Solok Selatan"],
  ]);

  return aliases.get(normalized) || normalized;
}

function normalizeCityFromAddress(address = {}) {
  const countyValue = address.county || address.state_district;
  if (countyValue) {
    const raw = String(countyValue || "");
    const name = cleanName(raw);
    const prefix = /\bkota\b|\bcity\b|jakarta/i.test(raw) ? "Kota" : "Kabupaten";
    return name ? normalizeKnownAdministrativeName(`${prefix} ${titleCase(name)}`) : "";
  }

  const cityValue = address.city || address.town;
  if (cityValue) {
    const name = cleanName(cityValue);
    return name ? normalizeKnownAdministrativeName(`Kota ${titleCase(name)}`) : "";
  }

  const municipalityValue = address.municipality || address.city_district || address.region;
  if (municipalityValue) {
    const name = cleanName(municipalityValue);
    return name ? normalizeKnownAdministrativeName(titleCase(name)) : "";
  }

  return "";
}

function normalizeResult(payload) {
  const address = payload.address || {};
  return {
    provinsi: normalizeProvince(address.state || address.province || address.region || "", address),
    kota_kabupaten: normalizeCityFromAddress(address),
    raw: payload,
  };
}

function sqlString(value) {
  if (!value) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function reverseGeocode(row) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", row.latitude);
  url.searchParams.set("lon", row.longitude);
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "id,en");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim ${response.status} untuk ${row.no_bp}`);
  }

  return normalizeResult(await response.json());
}

function buildSql(rows) {
  const values = rows
    .filter((row) => row.provinsi && row.kota_kabupaten)
    .map((row) => `  (${sqlString(row.no_bp)}, ${sqlString(row.provinsi)}, ${sqlString(row.kota_kabupaten)})`)
    .join(",\n");

  return `-- Generated from latitude/longitude reverse geocoding.\n-- Safe to run repeatedly. Only fills or refreshes wilayah columns by no_bp.\n\nALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS provinsi TEXT;\nALTER TABLE mahasiswa ADD COLUMN IF NOT EXISTS kota_kabupaten TEXT;\n\nUPDATE mahasiswa AS m\nSET\n  provinsi = v.provinsi,\n  kota_kabupaten = v.kota_kabupaten\nFROM (VALUES\n${values}\n) AS v(no_bp, provinsi, kota_kabupaten)\nWHERE m.no_bp = v.no_bp;\n`;
}

async function main() {
  const rows = parseMahasiswaCsv(fs.readFileSync(SEED_PATH, "utf8"))
    .filter((row) => row.no_bp && row.latitude !== null && row.longitude !== null);
  const cache = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))
    : {};
  const enriched = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = `${Number(row.latitude).toFixed(7)},${Number(row.longitude).toFixed(7)}`;

    try {
      if (!cache[key]) {
        cache[key] = await reverseGeocode(row);
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
        await sleep(REQUEST_DELAY_MS);
      } else if (cache[key].raw) {
        cache[key] = normalizeResult(cache[key].raw);
      }

      const result = cache[key];
      enriched.push({
        no_bp: row.no_bp,
        provinsi: result.provinsi,
        kota_kabupaten: result.kota_kabupaten,
      });
      console.log(`${index + 1}/${rows.length} ${row.no_bp} -> ${result.kota_kabupaten || "-"}, ${result.provinsi || "-"}`);
    } catch (error) {
      console.error(`${index + 1}/${rows.length} ${row.no_bp} gagal: ${error.message}`);
      enriched.push({ no_bp: row.no_bp, provinsi: "", kota_kabupaten: "" });
    }
  }

  fs.writeFileSync(OUTPUT_SQL_PATH, buildSql(enriched));
  const complete = enriched.filter((row) => row.provinsi && row.kota_kabupaten).length;
  console.log(`Selesai: ${complete}/${rows.length} data wilayah ditulis ke ${OUTPUT_SQL_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
