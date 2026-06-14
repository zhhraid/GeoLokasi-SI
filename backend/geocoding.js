const loadEnv = require("./load-env");

loadEnv();

const GEOCODING_URL = process.env.GEOCODING_URL || "https://nominatim.openstreetmap.org/search";
const GEOCODING_DELAY_MS = Number(process.env.GEOCODING_DELAY_MS || 1100);
const USER_AGENT =
  process.env.GEOCODING_USER_AGENT || "AsalSI-WebGIS/1.0 (geocoding alamat mahasiswa)";
const FALLBACK_LOCATION = {
  latitude: Number(process.env.GEOCODING_FALLBACK_LATITUDE || -0.9471),
  longitude: Number(process.env.GEOCODING_FALLBACK_LONGITUDE || 100.4172),
  matchedAddress: process.env.GEOCODING_FALLBACK_LABEL || "Kota Padang, Sumatera Barat, Indonesia",
};
const INDONESIAN_PROVINCES = [
  "Aceh",
  "Sumatera Utara",
  "Sumatera Barat",
  "Riau",
  "Kepulauan Riau",
  "Jambi",
  "Bengkulu",
  "Sumatera Selatan",
  "Kepulauan Bangka Belitung",
  "Lampung",
  "Banten",
  "DKI Jakarta",
  "Jawa Barat",
  "Jawa Tengah",
  "DI Yogyakarta",
  "Jawa Timur",
  "Bali",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Sulawesi Utara",
  "Gorontalo",
  "Sulawesi Tengah",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tenggara",
  "Maluku",
  "Maluku Utara",
  "Papua",
  "Papua Barat",
];

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildSearchAddress(address) {
  const normalized = String(address || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");

  if (!normalized) {
    return "";
  }

  return /\bindonesia\b/i.test(normalized) ? normalized : `${normalized}, Indonesia`;
}

function expandAddressAbbreviations(address) {
  return address
    .replace(/\bjl\.?\s*/gi, "Jalan ")
    .replace(/\bkec\.?\s*/gi, "Kecamatan ")
    .replace(/\bkel\.?\s*/gi, "Kelurahan ")
    .replace(/\bkota\s+padang\b/gi, "Kota Padang")
    .replace(/\bsumbar\b/gi, "Sumatera Barat")
    .replace(/\s+/g, " ")
    .trim();
}

function getProvinceCandidate(address) {
  const matchedProvince = INDONESIAN_PROVINCES.find((province) =>
    address.toLocaleLowerCase("id-ID").includes(province.toLocaleLowerCase("id-ID"))
  );

  return matchedProvince ? `${matchedProvince}, Indonesia` : "";
}

function buildSearchCandidates(address) {
  const searchAddress = buildSearchAddress(address);

  if (!searchAddress) {
    return [];
  }

  const expandedAddress = expandAddressAbbreviations(searchAddress);
  const originalAddress = expandAddressAbbreviations(String(address || ""));
  const provinceCandidate = getProvinceCandidate(originalAddress);
  const parts = expandedAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const withoutHouseNumber = expandedAddress
    .replace(/\b(?:no\.?|nomor)\s*\d+[a-z]?\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  const rawAddress = parts.filter((part) => !/^indonesia$/i.test(part)).join(", ");
  const localCandidates = [
    `${rawAddress}, Kota Padang, Sumatera Barat, Indonesia`,
    `${rawAddress}, Sumatera Barat, Indonesia`,
  ];
  const candidates = provinceCandidate
    ? [expandedAddress, withoutHouseNumber, provinceCandidate]
    : [...localCandidates, expandedAddress, withoutHouseNumber];

  if (parts.length > 2) {
    candidates.push(parts.slice(1).join(", "));
  }

  if (parts.length > 3) {
    candidates.push(parts.slice(2).join(", "));
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function geocodeCandidate(searchAddress) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("q", searchAddress);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "id");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Layanan geocoding merespons HTTP ${response.status}`);
  }

  const results = await response.json();
  const result = results[0];

  if (!result) {
    return null;
  }

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude, matchedAddress: searchAddress };
}

async function geocodeAddress(address) {
  const candidates = buildSearchCandidates(address);
  const directAddress = expandAddressAbbreviations(buildSearchAddress(address));

  for (let index = 0; index < candidates.length; index += 1) {
    if (index > 0 && GEOCODING_DELAY_MS > 0) {
      await sleep(GEOCODING_DELAY_MS);
    }

    const coordinates = await geocodeCandidate(candidates[index]);

    if (coordinates) {
      const isDirectMatch = candidates[index] === directAddress;

      return {
        ...coordinates,
        approximate: !isDirectMatch,
        accuracy: isDirectMatch ? "exact" : "approximate",
      };
    }
  }

  return {
    ...FALLBACK_LOCATION,
    approximate: true,
    accuracy: "fallback",
  };
}

async function geocodeMahasiswaRows(rows) {
  const cache = new Map();
  const resolvedRows = [];
  const rejectedRows = [];
  let geocoded = 0;
  let approximate = 0;
  let fallback = 0;
  let requestCount = 0;

  for (const item of rows) {
    const { row, rowNumber } = item;

    if (row.latitude !== null && row.longitude !== null) {
      resolvedRows.push(row);
      continue;
    }

    const cacheKey = row.alamat.toLocaleLowerCase("id-ID");

    if (!cache.has(cacheKey)) {
      if (requestCount > 0 && GEOCODING_DELAY_MS > 0) {
        await sleep(GEOCODING_DELAY_MS);
      }

      cache.set(cacheKey, await geocodeAddress(row.alamat));
      requestCount += 1;
    }

    const coordinates = cache.get(cacheKey);

    if (!coordinates) {
      rejectedRows.push({
        rowNumber,
        errors: [`Alamat tidak ditemukan oleh layanan geocoding: ${row.alamat}`],
      });
      continue;
    }

    row.latitude = coordinates.latitude;
    row.longitude = coordinates.longitude;
    resolvedRows.push(row);
    geocoded += 1;
    if (coordinates.approximate) approximate += 1;
    if (coordinates.accuracy === "fallback") fallback += 1;
  }

  return { approximate, fallback, geocoded, rejectedRows, rows: resolvedRows };
}

module.exports = {
  buildSearchAddress,
  buildSearchCandidates,
  geocodeAddress,
  geocodeMahasiswaRows,
};
