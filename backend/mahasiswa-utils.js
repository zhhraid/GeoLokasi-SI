const jalurMasukSql = `
  CASE SUBSTRING(no_bp FROM LENGTH(no_bp) - 3 FOR 1)
    WHEN '1' THEN 'SNBP'
    WHEN '2' THEN 'SNBT'
    WHEN '3' THEN 'Mandiri'
    WHEN '7' THEN 'Khusus'
    ELSE jalur_masuk
  END
`;

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

function normalizeCoordinate(value, type) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  const parsedValue = Number(rawValue.replace(",", "."));
  if (Number.isFinite(parsedValue) && rawValue.includes(".")) {
    return parsedValue;
  }

  return type === "latitude" ? normalizeLatitude(rawValue) : normalizeLongitude(rawValue);
}

function getJalurMasuk(noBp) {
  const kodeJalur = String(noBp || "").slice(-4, -3);
  const jalurMap = {
    1: "SNBP",
    2: "SNBT",
    3: "Mandiri",
    7: "Khusus",
  };

  return jalurMap[kodeJalur] || null;
}

function toInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeMahasiswaRow(row) {
  const noBp = String(row.no_bp || row.noBp || "").trim();

  return {
    id: toInteger(row.id),
    no_bp: noBp,
    angkatan: toInteger(row.angkatan),
    nama_lengkap: String(row.nama_lengkap || row.nama || row.namaLengkap || "").trim(),
    jenis_kelamin: String(row.jenis_kelamin || row.jenisKelamin || "").trim().toUpperCase(),
    asal_sekolah: String(row.asal_sekolah || row.asalSekolah || "").trim(),
    longitude: normalizeCoordinate(row.longitude, "longitude"),
    latitude: normalizeCoordinate(row.latitude, "latitude"),
    jalur_masuk: getJalurMasuk(noBp),
  };
}

function getValueByHeader(columns, headerIndex, name, fallbackIndex) {
  const index = headerIndex[name];
  return columns[index === undefined ? fallbackIndex : index];
}

function parseMahasiswaCsv(csv) {
  const lines = String(csv || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const headerIndex = headers.reduce((result, header, index) => {
    result[header] = index;
    return result;
  }, {});
  const hasHeader = ["no_bp", "nama_lengkap", "asal_sekolah"].some((header) => header in headerIndex);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(parseCsvLine).map((columns) =>
    normalizeMahasiswaRow({
      id: getValueByHeader(columns, headerIndex, "id", 0),
      no_bp: getValueByHeader(columns, headerIndex, "no_bp", 1),
      angkatan: getValueByHeader(columns, headerIndex, "angkatan", 2),
      nama_lengkap: getValueByHeader(columns, headerIndex, "nama_lengkap", 3),
      jenis_kelamin: getValueByHeader(columns, headerIndex, "jenis_kelamin", 4),
      asal_sekolah: getValueByHeader(columns, headerIndex, "asal_sekolah", 5),
      longitude: getValueByHeader(columns, headerIndex, "longitude", 6),
      latitude: getValueByHeader(columns, headerIndex, "latitude", 7),
    })
  );
}

function validateMahasiswa(row) {
  const errors = [];

  if (!row.no_bp) errors.push("No BP wajib diisi");
  if (!row.angkatan) errors.push("Angkatan wajib diisi");
  if (!row.nama_lengkap) errors.push("Nama lengkap wajib diisi");
  if (!["L", "P"].includes(row.jenis_kelamin)) errors.push("Jenis kelamin harus L atau P");
  if (!row.asal_sekolah) errors.push("Asal sekolah wajib diisi");
  if (row.longitude !== null && !Number.isFinite(row.longitude)) errors.push("Longitude tidak valid");
  if (row.latitude !== null && !Number.isFinite(row.latitude)) errors.push("Latitude tidak valid");

  return errors;
}

module.exports = {
  getJalurMasuk,
  jalurMasukSql,
  normalizeMahasiswaRow,
  parseMahasiswaCsv,
  validateMahasiswa,
};
