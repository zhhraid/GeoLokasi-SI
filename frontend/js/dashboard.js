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

    renderSummary(summary);
    renderTrend(summary.trenAngkatan || []);
    renderRanking(ranking || []);
    document.getElementById("data-status").textContent = "Aktif";
  } catch (error) {
    document.getElementById("data-status").textContent = "Error";
    document.getElementById("trend-chart").innerHTML = '<p class="empty-state">Statistik belum dapat dimuat.</p>';
    document.getElementById("ranking-list").innerHTML = "";
  }
}

function renderSummary(summary) {
  const trenAngkatan = summary.trenAngkatan || [];

  document.getElementById("total-mahasiswa").textContent = summary.totalMahasiswa || 0;
  document.getElementById("total-angkatan").textContent = trenAngkatan.length;
}

function renderTrend(rows) {
  const container = document.getElementById("trend-chart");
  const maxTotal = Math.max(...rows.map((row) => Number(row.total)), 1);

  container.innerHTML = rows
    .map((row) => {
      const total = Number(row.total);
      const width = Math.max((total / maxTotal) * 100, 4);

      return `
        <div class="trend-row">
          <span>${row.angkatan}</span>
          <div class="trend-track">
            <div class="trend-fill" style="width: ${width}%"></div>
          </div>
          <strong>${total}</strong>
        </div>
      `;
    })
    .join("");
}

function renderRanking(rows) {
  const container = document.getElementById("ranking-list");

  container.innerHTML = rows
    .map((row) => `
      <li>
        <strong>${row.asal_sekolah || "-"}</strong>
        <span>${row.total || 0} mahasiswa</span>
      </li>
    `)
    .join("");
}

loadDashboard();
