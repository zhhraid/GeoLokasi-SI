const jalurMasukSql = `
  COALESCE(
    NULLIF(jalur_masuk, ''),
    CASE SUBSTRING(no_bp FROM LENGTH(no_bp) - 3 FOR 1)
      WHEN '1' THEN 'SNBP'
      WHEN '2' THEN 'SNBT'
      WHEN '3' THEN 'MANDIRI'
      WHEN '7' THEN 'KHUSUS'
      ELSE NULL
    END
  )
`;

function parseCsvLine(line, delimiter = ",") {
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
    } else if (char === delimiter && !insideQuote) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function getCsvDelimiter(line) {
  const commaColumns = parseCsvLine(line, ",").length;
  const semicolonColumns = parseCsvLine(line, ";").length;

  return semicolonColumns > commaColumns ? ";" : ",";
}

function parseFlexibleCsvLine(line, preferredDelimiter) {
  let currentLine = line;

  // Excel dapat membungkus seluruh baris sebagai satu field beberapa kali.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const delimiter = getCsvDelimiter(currentLine) || preferredDelimiter;
    const columns = parseCsvLine(currentLine, delimiter);

    if (columns.length > 1) {
      return columns;
    }

    if (columns[0] === currentLine) {
      return columns;
    }

    currentLine = columns[0];
  }

  return [currentLine];
}

function repairMixedMahasiswaColumns(columns, headerIndex) {
  const asalSekolahIndex = headerIndex.asal_sekolah;
  const alamatIndex = headerIndex.alamat;
  const expectedColumnCount = Object.keys(headerIndex).length;

  if (
    columns.length === expectedColumnCount - 1 &&
    alamatIndex === asalSekolahIndex + 1 &&
    String(columns[asalSekolahIndex] || "").includes(",")
  ) {
    const combinedValue = columns[asalSekolahIndex];
    const separatorIndex = combinedValue.indexOf(",");

    return [
      ...columns.slice(0, asalSekolahIndex),
      combinedValue.slice(0, separatorIndex).trim(),
      combinedValue.slice(separatorIndex + 1).trim(),
      ...columns.slice(asalSekolahIndex + 1),
    ];
  }

  return columns;
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
  if (String(value || "").trim() === "") return null;

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
    alamat: String(row.alamat || row.address || "").trim(),
    longitude: normalizeCoordinate(row.longitude || row.x, "longitude"),
    latitude: normalizeCoordinate(row.latitude || row.y, "latitude"),
    jalur_masuk: String(row.jalur_masuk || row.jalurMasuk || getJalurMasuk(noBp) || "").trim() || null,
  };
}

function getValueByHeaders(columns, headerIndex, names, fallbackIndex) {
  const nameList = Array.isArray(names) ? names : [names];
  const populatedName = nameList.find((name) => {
    const index = headerIndex[name];
    return index !== undefined && String(columns[index] || "").trim() !== "";
  });
  const presentName = nameList.find((name) => headerIndex[name] !== undefined);
  const matchedName = populatedName || presentName;
  const index = matchedName === undefined ? fallbackIndex : headerIndex[matchedName];

  if (index === undefined) {
    return undefined;
  }

  return columns[index];
}

function normalizeCsvHeader(header) {
  const normalized = String(header || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[./-]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliases = {
    no: "nomor",
    nomor_urut: "nomor",
    no_bp: "no_bp",
    nobp: "no_bp",
    nim: "no_bp",
    nama: "nama_lengkap",
    nama_mahasiswa: "nama_lengkap",
    nama_lengkap: "nama_lengkap",
    jenis_kelamin: "jenis_kelamin",
    jk: "jenis_kelamin",
    nama_smta: "asal_sekolah",
    smta: "asal_sekolah",
    nama_sekolah: "asal_sekolah",
    asal_sekolah: "asal_sekolah",
    address: "alamat",
    alamat_rumah: "alamat",
  };

  return aliases[normalized] || normalized;
}

function parseMahasiswaCsv(csv) {
  const lines = String(csv || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = getCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeCsvHeader);
  const headerIndex = headers.reduce((result, header, index) => {
    result[header] = index;
    return result;
  }, {});
  const hasHeader = ["no_bp", "nama_lengkap", "asal_sekolah", "alamat"].some(
    (header) => header in headerIndex
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const fallback = (index) => (hasHeader ? undefined : index);

  return dataLines
    .map((line) => parseFlexibleCsvLine(line, delimiter))
    .map((columns) => repairMixedMahasiswaColumns(columns, headerIndex))
    .map((columns) =>
    normalizeMahasiswaRow({
      id: getValueByHeaders(columns, headerIndex, ["id", "fid"], undefined),
      no_bp: getValueByHeaders(columns, headerIndex, ["no_bp", "nobp"], fallback(1)),
      angkatan: getValueByHeaders(columns, headerIndex, "angkatan", fallback(2)),
      nama_lengkap: getValueByHeaders(columns, headerIndex, ["nama_lengkap", "nama"], fallback(3)),
      jenis_kelamin: getValueByHeaders(columns, headerIndex, "jenis_kelamin", fallback(4)),
      asal_sekolah: getValueByHeaders(columns, headerIndex, "asal_sekolah", fallback(5)),
      alamat: getValueByHeaders(columns, headerIndex, ["alamat", "address"], fallback(6)),
      longitude: getValueByHeaders(columns, headerIndex, ["longitude", "x"], fallback(7)),
      latitude: getValueByHeaders(columns, headerIndex, ["latitude", "y"], fallback(8)),
      jalur_masuk: getValueByHeaders(columns, headerIndex, "jalur_masuk", fallback(9)),
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
  if ((row.longitude === null || row.latitude === null) && !row.alamat) {
    errors.push("Alamat wajib diisi jika longitude dan latitude belum tersedia");
  }

  return errors;
}

module.exports = {
  getJalurMasuk,
  jalurMasukSql,
  normalizeMahasiswaRow,
  parseMahasiswaCsv,
  validateMahasiswa,
};
