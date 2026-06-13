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

  document.getElementById("total-mahasiswa").textContent = summary.totalMahasiswa || 0;
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
      datasets: [{
        label: "Jumlah Mahasiswa",
        data: rows.map((row) => Number(row.total)),
        backgroundColor: "#047857",
        borderRadius: 6,
      }],
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
      datasets: [{
        data: rows.map((row) => Number(row.total)),
        backgroundColor: ["#16a34a", "#2563eb", "#f97316", "#7c3aed", "#db2777", "#64748b"],
        borderWidth: 0,
      }],
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
      datasets: [{
        label: "Jumlah Mahasiswa",
        data: rows.map((row) => Number(row.total)),
        backgroundColor: "#2563eb",
        borderRadius: 6,
      }],
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
    .map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        ${columns.map((column) => `<td>${escapeReportHtml(row[column.key])}</td>`).join("")}
      </tr>
    `)
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
          label: (context) => `${context.dataset.label || context.label}: ${context.parsed.x ?? context.parsed.y ?? context.parsed}`,
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
  const topAngkatan = [...trenAngkatan].sort((a, b) => Number(b.total) - Number(a.total))[0];
  const lowestAngkatan = [...trenAngkatan].sort((a, b) => Number(a.total) - Number(b.total))[0];
  const topJalur = [...jalurMasuk].sort((a, b) => Number(b.total) - Number(a.total))[0];
  const topSchool = rankingRows[0];
  const latestYear = trenAngkatan[trenAngkatan.length - 1];
  const previousYear = trenAngkatan[trenAngkatan.length - 2];
  const latestDelta = latestYear && previousYear ? Number(latestYear.total) - Number(previousYear.total) : 0;
  const latestTrend = latestDelta > 0 ? "meningkat" : latestDelta < 0 ? "menurun" : "stabil";

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
      topAngkatan ? `Angkatan dengan jumlah mahasiswa terbanyak adalah ${topAngkatan.angkatan} sebanyak ${topAngkatan.total} mahasiswa, sedangkan jumlah paling rendah berada pada angkatan ${lowestAngkatan.angkatan} sebanyak ${lowestAngkatan.total} mahasiswa.` : "",
      latestYear && previousYear ? `Pada angkatan terbaru (${latestYear.angkatan}), jumlah mahasiswa ${latestTrend} ${Math.abs(latestDelta)} dibanding angkatan ${previousYear.angkatan}.` : "",
      topJalur ? `Jalur masuk paling dominan adalah ${topJalur.jalur_masuk} dengan ${topJalur.total} mahasiswa.` : "",
      topSchool ? `Asal sekolah dengan kontribusi terbesar adalah ${topSchool.asal_sekolah} sebanyak ${topSchool.total} mahasiswa.` : "",
    ].filter(Boolean),
  };
}

function renderDashboardKpis(summary, rankingRows) {
  const report = buildAutomaticReport(summary, rankingRows);
  latestAutoReport = report.paragraphs.join("\n");

  document.getElementById("kpi-top-angkatan").textContent = report.topAngkatan?.angkatan || "-";
  document.getElementById("kpi-top-angkatan-detail").textContent = report.topAngkatan
    ? `${report.topAngkatan.total} mahasiswa`
    : "Data belum tersedia";
  document.getElementById("kpi-latest-trend").textContent = report.latestYear?.angkatan || "-";
  document.getElementById("kpi-latest-trend-detail").textContent = report.previousYear
    ? `${report.latestTrend} ${Math.abs(report.latestDelta)} dari ${report.previousYear.angkatan}`
    : "Data belum tersedia";
  document.getElementById("kpi-top-jalur").textContent = report.topJalur?.jalur_masuk || "-";
  document.getElementById("kpi-top-jalur-detail").textContent = report.topJalur
    ? `${report.topJalur.total} mahasiswa`
    : "Data belum tersedia";
  document.getElementById("kpi-top-school").textContent = report.topSchool?.asal_sekolah || "-";
  document.getElementById("kpi-top-school-detail").textContent = report.topSchool
    ? `${report.topSchool.total} mahasiswa`
    : "Data belum tersedia";
}

function buildReportHtml(summary, rankingRows) {
  const trenAngkatan = summary.trenAngkatan || [];
  const jalurMasuk = summary.jalurMasuk || [];
  const totalMahasiswa = Number(summary.totalMahasiswa || 0);
  const topAngkatan = [...trenAngkatan].sort((a, b) => Number(b.total) - Number(a.total))[0];
  const topJalur = [...jalurMasuk].sort((a, b) => Number(b.total) - Number(a.total))[0];

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Statistik AsalSI WebGIS</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #0f172a;
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.45;
        }
        .report-header {
          padding-bottom: 14px;
          border-bottom: 2px solid #047857;
          margin-bottom: 18px;
        }
        .eyebrow {
          color: #047857;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h1 {
          margin: 5px 0 6px;
          font-size: 22px;
        }
        h2 {
          margin: 18px 0 8px;
          color: #064e3b;
          font-size: 15px;
        }
        p { margin: 0; color: #475569; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin: 14px 0 18px;
        }
        .summary-card {
          padding: 10px;
          border: 1px solid #dbe4ea;
          border-radius: 6px;
          background: #f8fafc;
        }
        .summary-card span {
          display: block;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .summary-card strong {
          display: block;
          margin-top: 5px;
          font-size: 18px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          page-break-inside: avoid;
        }
        th, td {
          padding: 7px 8px;
          border: 1px solid #dbe4ea;
          text-align: left;
          vertical-align: top;
        }
        th {
          color: #334155;
          background: #eef3f1;
          font-size: 10px;
          text-transform: uppercase;
        }
        .footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #dbe4ea;
          color: #64748b;
          font-size: 10px;
        }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:8px 12px">Cetak / Simpan PDF</button>
      <header class="report-header">
        <div class="eyebrow">AsalSI WebGIS - Universitas Andalas</div>
        <h1>Laporan Statistik Persebaran Asal Mahasiswa</h1>
        <p>Program Studi Sistem Informasi Universitas Andalas</p>
        <p>Dicetak pada ${escapeReportHtml(formatReportDate())}</p>
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
      ${latestAutoReport
        .split("\n")
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeReportHtml(paragraph)}</p>`)
        .join("")}

      <div class="footer">
        Laporan ini dibuat otomatis dari database WebGIS dan mencerminkan data yang tersedia saat tombol export ditekan.
      </div>

      <script>
        window.addEventListener("load", () => {
          setTimeout(() => window.print(), 250);
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
    reportWindow.document.write(buildReportHtml(latestDashboardSummary, latestRankingRows));
    reportWindow.document.close();
  } catch (error) {
    alert(error.message || "Gagal membuat laporan PDF.");
  } finally {
    button.disabled = false;
    button.textContent = "Export PDF";
  }
}

document.getElementById("export-report-button").addEventListener("click", exportDashboardReport);

loadDashboard();
