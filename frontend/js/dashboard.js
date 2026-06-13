let latestDashboardSummary = null;
let latestRankingRows = [];
let trendChartInstance = null;
let rankingChartInstance = null;
let jalurChartInstance = null;
let latestAutoReport = "";

async function loadDashboard() {
  try {
    const [summaryResponse, rankingResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/stats/summary`),
      fetch(`${API_BASE_URL}/stats/ranking-daerah`),
    ]);

    if (!summaryResponse.ok || !rankingResponse.ok) {
      throw new Error("Respons statistik tidak valid");
    }

    const summary = await summaryResponse.json();
    const ranking = await rankingResponse.json();
    latestDashboardSummary = summary;
    latestRankingRows = ranking || [];

    renderSummary(summary);
    renderTrend(summary.trenAngkatan || []);
    renderJalurChart(summary.jalurMasuk || []);
    renderRanking(ranking || []);
    renderDashboardKpis(summary, ranking || []);
    document.getElementById("data-status").textContent = "Aktif";
  } catch (error) {
    document.getElementById("data-status").textContent = "Error";
  }
}

function renderSummary(summary) {
  const trenAngkatan = summary.trenAngkatan || [];

  document.getElementById("total-mahasiswa").textContent =
    summary.totalMahasiswa || 0;
  document.getElementById("total-angkatan").textContent = trenAngkatan.length;
}

function renderTrend(rows) {
  const canvas = document.getElementById("trend-chart");

  if (!window.Chart || !canvas) {
    return;
  }

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((row) => row.angkatan),
      datasets: [
        {
          label: "Jumlah Mahasiswa",
          data: rows.map((row) => Number(row.total)),
          backgroundColor: "#047857",
          borderRadius: 6,
        },
      ],
    },
    options: getChartOptions({
      indexAxis: "x",
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    }),
  });
}

function renderJalurChart(rows) {
  const canvas = document.getElementById("jalur-chart");

  if (!window.Chart || !canvas) {
    return;
  }

  if (jalurChartInstance) {
    jalurChartInstance.destroy();
  }

  jalurChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: rows.map((row) => row.jalur_masuk),
      datasets: [
        {
          data: rows.map((row) => Number(row.total)),
          backgroundColor: [
            "#16a34a",
            "#2563eb",
            "#f97316",
            "#7c3aed",
            "#db2777",
            "#64748b",
          ],
          borderWidth: 0,
        },
      ],
    },
    options: getChartOptions({
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
          },
        },
      },
    }),
  });
}

function renderRanking(rows) {
  const canvas = document.getElementById("ranking-chart");

  if (!window.Chart || !canvas) {
    return;
  }

  if (rankingChartInstance) {
    rankingChartInstance.destroy();
  }

  rankingChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((row) => row.asal_sekolah || "-"),
      datasets: [
        {
          label: "Jumlah Mahasiswa",
          data: rows.map((row) => Number(row.total)),
          backgroundColor: "#2563eb",
          borderRadius: 6,
        },
      ],
    },
    options: getChartOptions({
      indexAxis: "y",
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    }),
  });
}

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeReportHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getAngkatanRange(rows) {
  if (!rows.length) {
    return "-";
  }

  return `${rows[0].angkatan} - ${rows[rows.length - 1].angkatan}`;
}

function renderReportRows(rows, columns) {
  return rows
    .map(
      (row, index) => `
      <tr>
        <td class="number-cell">${index + 1}</td>
        ${columns.map((column) => `<td>${escapeReportHtml(row[column.key])}</td>`).join("")}
      </tr>
    `,
    )
    .join("");
}

function getChartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 450,
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label || context.label}: ${context.parsed.x ?? context.parsed.y ?? context.parsed}`,
        },
      },
      ...(overrides.plugins || {}),
    },
    ...overrides,
  };
}

function buildAutomaticReport(summary, rankingRows) {
  const trenAngkatan = summary.trenAngkatan || [];
  const jalurMasuk = summary.jalurMasuk || [];
  const totalMahasiswa = Number(summary.totalMahasiswa || 0);
  const totalAngkatan = trenAngkatan.length;
  const topAngkatan = [...trenAngkatan].sort(
    (a, b) => Number(b.total) - Number(a.total),
  )[0];
  const lowestAngkatan = [...trenAngkatan].sort(
    (a, b) => Number(a.total) - Number(b.total),
  )[0];
  const topJalur = [...jalurMasuk].sort(
    (a, b) => Number(b.total) - Number(a.total),
  )[0];
  const topSchool = rankingRows[0];
  const latestYear = trenAngkatan[trenAngkatan.length - 1];
  const previousYear = trenAngkatan[trenAngkatan.length - 2];
  const latestDelta =
    latestYear && previousYear
      ? Number(latestYear.total) - Number(previousYear.total)
      : 0;
  const latestTrend =
    latestDelta > 0 ? "meningkat" : latestDelta < 0 ? "menurun" : "stabil";

  return {
    totalMahasiswa,
    totalAngkatan,
    topAngkatan,
    lowestAngkatan,
    topJalur,
    topSchool,
    latestYear,
    previousYear,
    latestDelta,
    latestTrend,
    paragraphs: [
      `Dataset saat ini memuat ${totalMahasiswa} mahasiswa dari ${totalAngkatan} angkatan, yaitu rentang ${getAngkatanRange(trenAngkatan)}.`,
      topAngkatan
        ? `Angkatan dengan jumlah mahasiswa terbanyak adalah ${topAngkatan.angkatan} sebanyak ${topAngkatan.total} mahasiswa, sedangkan jumlah paling rendah berada pada angkatan ${lowestAngkatan.angkatan} sebanyak ${lowestAngkatan.total} mahasiswa.`
        : "",
      latestYear && previousYear
        ? `Pada angkatan terbaru (${latestYear.angkatan}), jumlah mahasiswa ${latestTrend} ${Math.abs(latestDelta)} dibanding angkatan ${previousYear.angkatan}.`
        : "",
      topJalur
        ? `Jalur masuk paling dominan adalah ${topJalur.jalur_masuk} dengan ${topJalur.total} mahasiswa.`
        : "",
      topSchool
        ? `Asal sekolah dengan kontribusi terbesar adalah ${topSchool.asal_sekolah} sebanyak ${topSchool.total} mahasiswa.`
        : "",
    ].filter(Boolean),
  };
}

function renderDashboardKpis(summary, rankingRows) {
  const report = buildAutomaticReport(summary, rankingRows);
  latestAutoReport = report.paragraphs.join("\n");

  document.getElementById("kpi-top-angkatan").textContent =
    report.topAngkatan?.angkatan || "-";
  document.getElementById("kpi-top-angkatan-detail").textContent =
    report.topAngkatan
      ? `${report.topAngkatan.total} mahasiswa`
      : "Data belum tersedia";
  document.getElementById("kpi-latest-trend").textContent =
    report.latestYear?.angkatan || "-";
  document.getElementById("kpi-latest-trend-detail").textContent =
    report.previousYear
      ? `${report.latestTrend} ${Math.abs(report.latestDelta)} dari ${report.previousYear.angkatan}`
      : "Data belum tersedia";
  document.getElementById("kpi-top-jalur").textContent =
    report.topJalur?.jalur_masuk || "-";
  document.getElementById("kpi-top-jalur-detail").textContent = report.topJalur
    ? `${report.topJalur.total} mahasiswa`
    : "Data belum tersedia";
  document.getElementById("kpi-top-school").textContent =
    report.topSchool?.asal_sekolah || "-";
  document.getElementById("kpi-top-school-detail").textContent =
    report.topSchool
      ? `${report.topSchool.total} mahasiswa`
      : "Data belum tersedia";
}

function buildReportHtml(summary, rankingRows) {
  const trenAngkatan = summary.trenAngkatan || [];
  const jalurMasuk = summary.jalurMasuk || [];
  const totalMahasiswa = Number(summary.totalMahasiswa || 0);
  const topAngkatan = [...trenAngkatan].sort(
    (a, b) => Number(b.total) - Number(a.total),
  )[0];
  const topJalur = [...jalurMasuk].sort(
    (a, b) => Number(b.total) - Number(a.total),
  )[0];

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Statistik AsalSI WebGIS</title>
      <style>
        @page { size: A4 portrait; margin: 13mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #14213d;
          background: #e8eef2;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.5;
        }
        .report-toolbar {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px max(18px, calc((100% - 210mm) / 2));
          border-bottom: 1px solid #cbd5e1;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08);
        }
        .toolbar-copy {
          display: grid;
          gap: 2px;
        }
        .toolbar-copy strong { font-size: 13px; }
        .toolbar-copy span { color: #64748b; font-size: 10px; }
        .print-button {
          padding: 9px 16px;
          border: 1px solid #065f46;
          border-radius: 7px;
          color: #ffffff;
          background: #047857;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
          box-shadow: 0 6px 14px rgba(4, 120, 87, 0.2);
        }
        .print-button:hover { background: #065f46; }
        .report-page {
          width: min(210mm, calc(100% - 32px));
          min-height: 297mm;
          margin: 24px auto;
          padding: 16mm;
          background: #ffffff;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
        }
        .report-header {
          position: relative;
          overflow: hidden;
          padding: 18px 20px;
          border-radius: 10px;
          color: #ffffff;
          background: linear-gradient(135deg, #064e3b, #047857);
          margin-bottom: 16px;
        }
        .report-header::after {
          content: "";
          position: absolute;
          width: 130px;
          height: 130px;
          right: -45px;
          top: -50px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
        }
        .eyebrow {
          color: #d1fae5;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h1 {
          margin: 6px 0 8px;
          font-size: 21px;
          line-height: 1.2;
        }
        h2 {
          margin: 18px 0 8px;
          padding-bottom: 5px;
          border-bottom: 2px solid #d1fae5;
          color: #065f46;
          font-size: 13px;
        }
        p { margin: 0; color: #475569; }
        .report-header p { color: #ecfdf5; }
        .report-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px 16px;
          font-size: 10px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin: 0 0 16px;
        }
        .summary-card {
          padding: 11px 12px;
          border: 1px solid #d7e4df;
          border-left: 4px solid #047857;
          border-radius: 7px;
          background: #f8fbfa;
        }
        .summary-card span {
          display: block;
          color: #52677a;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .summary-card strong {
          display: block;
          margin-top: 3px;
          color: #14213d;
          font-size: 16px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 14px;
          border: 1px solid #cbd9d4;
          font-size: 10px;
        }
        th, td {
          padding: 5px 7px;
          border-bottom: 1px solid #dbe4ea;
          text-align: left;
          vertical-align: top;
        }
        th {
          color: #ffffff;
          background: #0f766e;
          font-size: 9px;
          text-transform: uppercase;
        }
        tbody tr:nth-child(even) { background: #f4f8f7; }
        tbody tr { break-inside: avoid; }
        .number-cell { width: 38px; text-align: center; }
        .analysis-panel {
          display: grid;
          gap: 7px;
          padding: 12px 14px;
          border: 1px solid #d7e4df;
          border-radius: 8px;
          background: #f8fbfa;
        }
        .analysis-panel p {
          padding-left: 10px;
          border-left: 3px solid #10b981;
        }
        .footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #cbd9d4;
          color: #64748b;
          font-size: 9px;
          text-align: center;
        }
        @media print {
          .no-print { display: none; }
          body { background: #ffffff; }
          .report-page {
            width: auto;
            min-height: 0;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
          h2, .summary-grid, .analysis-panel { break-after: avoid; }
          table { break-inside: auto; }
        }
        @media (max-width: 720px) {
          .report-toolbar { padding: 10px 14px; }
          .report-page { width: calc(100% - 20px); margin: 10px auto; padding: 16px; }
          .summary-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="report-toolbar no-print">
        <div class="toolbar-copy">
          <strong>Pratinjau Laporan Statistik</strong>
          <span>Gunakan dialog cetak untuk mencetak atau menyimpan sebagai PDF.</span>
        </div>
        <button id="print-report-button" class="print-button" type="button">Cetak / Simpan PDF</button>
      </div>
      <main class="report-page">
      <header class="report-header">
        <div class="eyebrow">AsalSI WebGIS - Universitas Andalas</div>
        <h1>Laporan Statistik Persebaran Asal Mahasiswa</h1>
        <div class="report-meta">
          <p>Program Studi Sistem Informasi Universitas Andalas</p>
          <p>Dibuat pada ${escapeReportHtml(formatReportDate())}</p>
        </div>
      </header>

      <section class="summary-grid">
        <div class="summary-card">
          <span>Total Mahasiswa</span>
          <strong>${totalMahasiswa}</strong>
        </div>
        <div class="summary-card">
          <span>Rentang Angkatan</span>
          <strong>${escapeReportHtml(getAngkatanRange(trenAngkatan))}</strong>
        </div>
        <div class="summary-card">
          <span>Angkatan Terbanyak</span>
          <strong>${topAngkatan ? `${escapeReportHtml(topAngkatan.angkatan)} (${escapeReportHtml(topAngkatan.total)})` : "-"}</strong>
        </div>
        <div class="summary-card">
          <span>Jalur Terbanyak</span>
          <strong>${topJalur ? `${escapeReportHtml(topJalur.jalur_masuk)} (${escapeReportHtml(topJalur.total)})` : "-"}</strong>
        </div>
      </section>

      <h2>Tren Mahasiswa Per Angkatan</h2>
      <table>
        <thead>
          <tr><th>No</th><th>Angkatan</th><th>Total Mahasiswa</th></tr>
        </thead>
        <tbody>${renderReportRows(trenAngkatan, [{ key: "angkatan" }, { key: "total" }])}</tbody>
      </table>

      <h2>Distribusi Jalur Masuk</h2>
      <table>
        <thead>
          <tr><th>No</th><th>Jalur Masuk</th><th>Total Mahasiswa</th></tr>
        </thead>
        <tbody>${renderReportRows(jalurMasuk, [{ key: "jalur_masuk" }, { key: "total" }])}</tbody>
      </table>

      <h2>Ranking Asal Sekolah</h2>
      <table>
        <thead>
          <tr><th>No</th><th>Asal Sekolah</th><th>Total Mahasiswa</th></tr>
        </thead>
        <tbody>${renderReportRows(rankingRows, [{ key: "asal_sekolah" }, { key: "total" }])}</tbody>
      </table>

      <h2>Laporan Statistik Otomatis</h2>
      <section class="analysis-panel">
        ${latestAutoReport
          .split("\n")
          .filter(Boolean)
          .map((paragraph) => `<p>${escapeReportHtml(paragraph)}</p>`)
          .join("")}
      </section>

      <div class="footer">
        Laporan ini dibuat otomatis dari database WebGIS dan mencerminkan data yang tersedia saat tombol export ditekan.
      </div>
      </main>

      <script>
        window.addEventListener("load", () => {
          document.getElementById("print-report-button").addEventListener("click", () => {
            window.focus();
            window.print();
          });
        });
      </script>
    </body>
    </html>
  `;
}

async function exportDashboardReport() {
  const button = document.getElementById("export-report-button");
  button.disabled = true;
  button.textContent = "Menyiapkan...";

  try {
    if (!latestDashboardSummary) {
      await loadDashboard();
    }

    const reportWindow = window.open("", "_blank");

    if (!reportWindow) {
      throw new Error("Pop-up laporan diblokir browser.");
    }

    reportWindow.document.open();
    reportWindow.document.write(
      buildReportHtml(latestDashboardSummary, latestRankingRows),
    );
    reportWindow.document.close();
    reportWindow.focus();
  } catch (error) {
    alert(error.message || "Gagal membuat laporan PDF.");
  } finally {
    button.disabled = false;
    button.textContent = "Export PDF";
  }
}

document
  .getElementById("export-report-button")
  .addEventListener("click", exportDashboardReport);

loadDashboard();
