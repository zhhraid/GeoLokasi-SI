const ExcelJS = require("exceljs");
const { parseMahasiswaCsv } = require("./mahasiswa-utils");

function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function getWorksheetRows(worksheet) {
  const rows = [];
  let firstColumn = null;
  let lastColumn = null;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const populatedColumns = [];

    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (cell.text.trim()) {
        populatedColumns.push(column);
      }
    });

    if (populatedColumns.length > 1 && firstColumn === null) {
      firstColumn = Math.min(...populatedColumns);
      lastColumn = Math.max(...populatedColumns);
    }
  });

  if (firstColumn === null || lastColumn === null) {
    return rows;
  }

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      values.push(row.getCell(column).text.trim());
    }

    if (values.some(Boolean)) {
      rows.push(values);
    }
  });

  return rows;
}

async function parseMahasiswaWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets = workbook.worksheets
    .map((worksheet) => ({
      rows: getWorksheetRows(worksheet),
      sheetName: worksheet.name,
    }))
    .filter((sheet) => sheet.rows.length > 1);

  if (sheets.length === 0) {
    return { rows: [], sheetName: null };
  }

  const selectedSheet = sheets.sort((a, b) => b.rows.length - a.rows.length)[0];
  const csv = selectedSheet.rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const rows = parseMahasiswaCsv(csv).map((row) => ({
    ...row,
    asal_sekolah: row.asal_sekolah || "-",
  }));

  return {
    rows,
    sheetName: selectedSheet.sheetName,
  };
}

module.exports = {
  parseMahasiswaWorkbook,
};
