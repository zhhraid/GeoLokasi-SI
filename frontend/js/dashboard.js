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
    renderDashboardInsights(summary, ranking || []);
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
          backgroundColor: (() => {
            const max = Math.max(...rows.map((r) => Number(r.total)), 1);
            return rows.map((row) => {
              const ratio = Number(row.total) / max;
              const alpha = (0.42 + ratio * 0.58).toFixed(2);
              return `rgba(16, 185, 129, ${alpha})`;
            });
          })(),
          borderColor: "#10b981",
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
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
            "#3b82f6",  // SNBP  - biru
            "#10b981",  // SNBT  - emerald
            "#f59e0b",  // MANDIRI - amber
            "#8b5cf6",  // PRESTASI - violet
            "#f43f5e",  // AFIRMASI - rose
            "#06b6d4",  // KHUSUS - cyan
            "#94a3b8",  // LAINNYA - slate
          ],
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 6,
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
            padding: 14,
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
          backgroundColor: rows.map((_, i) => {
            const alpha = Math.max(0.30, 1 - i * 0.08).toFixed(2);
            return `rgba(59, 130, 246, ${alpha})`;
          }),
          borderColor: "#3b82f6",
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
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
      `Total: ${totalMahasiswa} mahasiswa, ${totalAngkatan} angkatan (${getAngkatanRange(trenAngkatan)}).`,
      topAngkatan
        ? `Angkatan terbanyak: ${topAngkatan.angkatan} (${topAngkatan.total}), terendah: ${lowestAngkatan?.angkatan} (${lowestAngkatan?.total}).`
        : "",
      latestYear && previousYear
        ? `Angkatan ${latestYear.angkatan} ${latestTrend} ${Math.abs(latestDelta)} dari ${previousYear.angkatan}.`
        : "",
      topJalur
        ? `Jalur dominan: ${topJalur.jalur_masuk} (${topJalur.total} mahasiswa).`
        : "",
      topSchool
        ? `Sekolah terbesar: ${topSchool.asal_sekolah} (${topSchool.total} mahasiswa).`
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

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1).replace(".0", "")}%` : "-";
}

function renderDashboardInsights(summary, rankingRows) {
  const report = buildAutomaticReport(summary, rankingRows);
  const trenAngkatan = summary.trenAngkatan || [];
  const jalurMasuk = summary.jalurMasuk || [];
  const totalMahasiswa = Number(summary.totalMahasiswa || 0);
  const averagePerCohort = report.totalAngkatan
    ? Math.round(totalMahasiswa / report.totalAngkatan)
    : 0;
  const topFiveTotal = rankingRows
    .slice(0, 5)
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
  const topSchoolShare = totalMahasiswa ? (topFiveTotal / totalMahasiswa) * 100 : 0;
  const topJalurShare =
    totalMahasiswa && report.topJalur
      ? (Number(report.topJalur.total || 0) / totalMahasiswa) * 100
      : 0;
  const latestDeltaText =
    report.previousYear && report.latestYear
      ? `${report.latestDelta > 0 ? "+" : ""}${report.latestDelta}`
      : "-";

  document.getElementById("insight-average-cohort").textContent =
    averagePerCohort || "-";
  document.getElementById("insight-average-cohort-detail").textContent =
    report.totalAngkatan
      ? `dari ${report.totalAngkatan} angkatan`
      : "Data belum tersedia";
  document.getElementById("insight-top-school-share").textContent =
    formatPercent(topSchoolShare);
  document.getElementById("insight-top-school-share-detail").textContent =
    topFiveTotal
      ? `${topFiveTotal} mahasiswa`
      : "Data belum tersedia";
  document.getElementById("insight-top-jalur-share").textContent =
    formatPercent(topJalurShare);
  document.getElementById("insight-top-jalur-share-detail").textContent =
    report.topJalur
      ? `${report.topJalur.jalur_masuk} dengan ${report.topJalur.total} mahasiswa`
      : "Data belum tersedia";
  document.getElementById("insight-latest-delta").textContent = latestDeltaText;
  document.getElementById("insight-latest-delta-detail").textContent =
    report.previousYear && report.latestYear
      ? `${report.latestTrend} sejak ${report.previousYear.angkatan}`
      : "Data belum tersedia";

  renderTopSchoolList(rankingRows, totalMahasiswa);
}

function renderTopSchoolList(rows, totalMahasiswa) {
  const container = document.getElementById("top-school-list");
  const topRows = rows.slice(0, 6);

  if (!topRows.length) {
    container.innerHTML = '<p class="admin-message">Data ranking asal sekolah belum tersedia.</p>';
    return;
  }

  const maxTotal = Math.max(...topRows.map((row) => Number(row.total || 0)), 1);

  container.innerHTML = topRows
    .map((row, index) => {
      const total = Number(row.total || 0);
      const width = Math.max(4, (total / maxTotal) * 100);
      const share = totalMahasiswa ? (total / totalMahasiswa) * 100 : 0;

      return `
        <article class="top-school-item">
          <div>
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeReportHtml(row.asal_sekolah || "-")}</strong>
            <small>${total} mahasiswa - ${formatPercent(share)} dari total</small>
          </div>
          <div class="school-progress" aria-hidden="true">
            <i style="width: ${width}%"></i>
          </div>
        </article>
      `;
    })
    .join("");
}


function buildFilteredReportData(rows) {
  const countBy = (key, fallback = "Belum tersedia") => {
    const counts = new Map();

    rows.forEach((row) => {
      const value = row[key] || fallback;
      counts.set(value, (counts.get(value) || 0) + 1);
    });

    return [...counts.entries()].map(([value, total]) => ({ value, total }));
  };
  const trenAngkatan = countBy("angkatan")
    .map((row) => ({ angkatan: row.value, total: row.total }))
    .sort((a, b) => Number(a.angkatan) - Number(b.angkatan));
  const jalurMasuk = countBy("jalur_masuk")
    .map((row) => ({ jalur_masuk: row.value, total: row.total }))
    .sort((a, b) => b.total - a.total);
  const rankingRows = countBy("asal_sekolah")
    .map((row) => ({ asal_sekolah: row.value, total: row.total }))
    .sort((a, b) => b.total - a.total || String(a.asal_sekolah).localeCompare(String(b.asal_sekolah)))
    .slice(0, 10);

  return {
    rankingRows,
    summary: {
      totalMahasiswa: rows.length,
      trenAngkatan,
      jalurMasuk,
    },
  };
}

function buildReportHtml(summary, rankingRows, options = {}) {
  const trenAngkatan = summary.trenAngkatan || [];
  const jalurMasuk = summary.jalurMasuk || [];
  const totalMahasiswa = Number(summary.totalMahasiswa || 0);
  const filters = options.filters || null;
  const studentRows = options.studentRows || [];
  const reportAnalysis = options.analysis || latestAutoReport;
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
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
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
        .filter-summary {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px 14px;
          margin-bottom: 16px;
          padding: 10px 12px;
          border: 1px solid #d7e4df;
          border-radius: 7px;
          background: #f8fbfa;
        }
        .filter-summary div { display: grid; gap: 2px; }
        .filter-summary span {
          color: #64748b;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .filter-summary strong { color: #14213d; font-size: 10px; }
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
        thead { display: table-header-group; }
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
          html, body {
            width: 210mm;
            margin: 0;
            background: #ffffff;
          }
          .report-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 16mm;
            box-shadow: none;
          }
          .report-header {
            color: #ffffff !important;
            background: #047857 !important;
            box-shadow: inset 0 0 0 1000px #047857 !important;
          }
          .report-header .eyebrow {
            color: #d1fae5 !important;
          }
          .report-header p {
            color: #ecfdf5 !important;
          }
          .report-header::after {
            background: transparent !important;
            box-shadow: inset 0 0 0 1000px rgba(255, 255, 255, 0.12) !important;
          }
          th {
            color: #ffffff !important;
            background: #0f766e !important;
            box-shadow: inset 0 0 0 1000px #0f766e !important;
          }
          .summary-card,
          .filter-summary,
          .analysis-panel {
            background: #f8fbfa !important;
            box-shadow: inset 0 0 0 1000px #f8fbfa !important;
          }
          tbody tr:nth-child(even) td {
            background: #f4f8f7 !important;
            box-shadow: inset 0 0 0 1000px #f4f8f7 !important;
          }
          .report-header,
          .filter-summary,
          .summary-card,
          .analysis-panel,
          th,
          tbody tr:nth-child(even) {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            forced-color-adjust: none;
          }
          h2, .summary-grid, .filter-summary, .analysis-panel {
            break-after: avoid;
          }
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
          <span>Klik Unduh PDF untuk menyimpan laporan ke unduhan browser.</span>
        </div>
        <button id="download-report-button" class="print-button" type="button">Unduh PDF</button>
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

      ${filters ? `
      <h2>Filter yang Digunakan</h2>
      <section class="filter-summary">
        <div><span>Pencarian</span><strong>${escapeReportHtml(filters.pencarian)}</strong></div>
        <div><span>Jalur Masuk</span><strong>${escapeReportHtml(filters.jalurMasuk)}</strong></div>
        <div><span>Angkatan</span><strong>${escapeReportHtml(filters.angkatan)}</strong></div>
        <div><span>Jenis Kelamin</span><strong>${escapeReportHtml(filters.jenisKelamin)}</strong></div>
      </section>
      ` : ""}

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
        ${reportAnalysis
          .split("\n")
          .filter(Boolean)
          .map((paragraph) => `<p>${escapeReportHtml(paragraph)}</p>`)
          .join("")}
      </section>

      ${studentRows.length ? `
      <h2>Data Mahasiswa Sesuai Filter</h2>
      <table>
        <thead>
          <tr><th>No</th><th>No BP</th><th>Nama</th><th>Angkatan</th><th>JK</th><th>Asal Sekolah</th><th>Alamat</th><th>Jalur</th></tr>
        </thead>
        <tbody>${renderReportRows(studentRows, [
          { key: "no_bp" },
          { key: "nama_lengkap" },
          { key: "angkatan" },
          { key: "jenis_kelamin" },
          { key: "asal_sekolah" },
          { key: "alamat" },
          { key: "jalur_masuk" },
        ])}</tbody>
      </table>
      ` : ""}

      <div class="footer">
        Laporan dibuat otomatis dari database WebGIS · Data per tanggal export.
      </div>
      </main>

      <script>
        window.addEventListener("load", () => {
          const downloadButton = document.getElementById("download-report-button");

          downloadButton.addEventListener("click", async () => {
            const originalText = downloadButton.textContent;
            downloadButton.disabled = true;
            downloadButton.textContent = "Menyiapkan PDF...";

            try {
              if (typeof html2pdf === "undefined") {
                throw new Error("Library PDF belum berhasil dimuat.");
              }

              await html2pdf()
                .set({
                  margin: 0,
                  filename: "GeoSIS-Laporan-${new Date().toISOString().slice(0, 10)}.pdf",
                  image: { type: "jpeg", quality: 0.98 },
                  html2canvas: {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    logging: false,
                    useCORS: true
                  },
                  jsPDF: {
                    unit: "mm",
                    format: "a4",
                    orientation: "portrait"
                  },
                  pagebreak: {
                    mode: ["css", "legacy"],
                    avoid: [".report-header", ".filter-summary", ".summary-card", ".analysis-panel", "tr"]
                  }
                })
                .from(document.querySelector(".report-page"))
                .save();
            } catch (error) {
              alert(error.message || "Gagal mengunduh PDF.");
            } finally {
              downloadButton.disabled = false;
              downloadButton.textContent = originalText;
            }
          });
        });
      </script>
    </body>
    </html>
  `;
}

async function exportDashboardReport() {
  const button = document.getElementById("export-report-button");
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    alert("Pop-up diblokir browser. Izinkan pop-up untuk membuat laporan.");
    return;
  }

  button.disabled = true;
  button.textContent = "Menyiapkan...";
  reportWindow.document.open();
  reportWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Menyiapkan Laporan GeoSIS</title>
        <style>
          body {
            display: grid;
            min-height: 100vh;
            margin: 0;
            place-items: center;
            color: #064e3b;
            background: #f8fafc;
            font-family: Arial, Helvetica, sans-serif;
          }
          div {
            padding: 24px 28px;
            border: 1px solid #d1fae5;
            border-radius: 12px;
            background: #ffffff;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
            text-align: center;
          }
          strong { display: block; margin-bottom: 6px; }
          span { color: #64748b; font-size: 13px; }
        </style>
      </head>
      <body>
        <div>
          <strong>Menyiapkan laporan GeoSIS...</strong>
          <span>Data statistik sedang dimuat.</span>
        </div>
      </body>
    </html>
  `);
  reportWindow.document.close();

  try {
    if (typeof window.getAdminExportData === "function") {
      const exportData = await window.getAdminExportData();
      const filteredReport = buildFilteredReportData(exportData.rows);
      const filterDescription = `${exportData.rows.length} mahasiswa sesuai filter aktif.`;

      reportWindow.document.open();
      reportWindow.document.write(
        buildReportHtml(filteredReport.summary, filteredReport.rankingRows, {
          analysis: filterDescription,
          filters: exportData.filters,
          studentRows: exportData.rows,
        }),
      );
      reportWindow.document.close();
      reportWindow.focus();
      return;
    }

    if (!latestDashboardSummary) {
      await loadDashboard();
    }

    if (!latestDashboardSummary) {
      throw new Error("Data statistik belum tersedia.");
    }

    reportWindow.document.open();
    reportWindow.document.write(
      buildReportHtml(latestDashboardSummary, latestRankingRows),
    );
    reportWindow.document.close();
    reportWindow.focus();
  } catch (error) {
    reportWindow.close();
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
