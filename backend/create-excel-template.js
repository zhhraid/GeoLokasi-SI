const path = require("path");
const ExcelJS = require("exceljs");

async function main() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data Mahasiswa", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "No.", key: "nomor", width: 8 },
    { header: "No BP", key: "no_bp", width: 18 },
    { header: "Angkatan", key: "angkatan", width: 12 },
    { header: "Nama Lengkap", key: "nama_lengkap", width: 30 },
    { header: "Jenis Kelamin", key: "jenis_kelamin", width: 16 },
    { header: "Alamat", key: "alamat", width: 60 },
    { header: "Nama SMTA", key: "nama_smta", width: 30 },
  ];

  worksheet.addRow({
    nomor: 1,
    no_bp: "2611521001",
    angkatan: 2026,
    nama_lengkap: "Lini Maharani",
    jenis_kelamin: "P",
    alamat: "BATU KULAMBAI, KAB. SOLOK SELATAN, SUMATERA BARAT",
    nama_smta: "SMAN 5 SOLOK SELATAN",
  });

  worksheet.getRow(1).height = 30;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  worksheet.getRow(2).eachCell((cell) => {
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });

  worksheet.getColumn("no_bp").numFmt = "@";
  worksheet.autoFilter = "A1:G1";

  const outputPath = path.join(__dirname, "..", "template-import-mahasiswa.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Template Excel dibuat: ${outputPath}`);
}

main().catch((error) => {
  console.error("Gagal membuat template Excel:", error.message);
  process.exit(1);
});
