const ADMIN_API_BASE_URL = `${window.location.origin}/api`;
const ADMIN_TOKEN_KEY = "asalsi_admin_token";
const ADMIN_ROLE_KEY = "asalsi_admin_role";

const adminLoginButton = document.getElementById("admin-login-button");
const adminLogoutButton = document.getElementById("admin-logout-button");
const adminMenuButton = document.getElementById("admin-menu");
const loginModal = document.getElementById("login-modal");
const loginStatus = document.getElementById("login-status");
const adminStatus = document.getElementById("admin-status");
const adminSearchInput = document.getElementById("admin-search-input");
const adminTableStatus = document.getElementById("admin-table-status");
const manualNoBpInput = document.getElementById("manual-no-bp");
const generateGeocodingButton = document.getElementById("generate-geocoding-button");
const geocodingStatus = document.getElementById("geocoding-status");
const manualCoordinateSection = document.getElementById("manual-coordinate-section");
let openAdminAfterLogin = false;

localStorage.removeItem(ADMIN_TOKEN_KEY);
localStorage.removeItem(ADMIN_ROLE_KEY);

function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function getUserRole() {
  return sessionStorage.getItem(ADMIN_ROLE_KEY);
}

function setAuthSession(token, role) {
  if (token) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(ADMIN_ROLE_KEY, role || "user");
  } else {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_ROLE_KEY);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function debounceAdmin(callback, delay = 320) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

function updateAuthButtons() {
  const isLoggedIn = Boolean(getAdminToken());
  const isAdmin = getUserRole() === "admin";

  adminLoginButton.classList.toggle("hidden", isLoggedIn);
  adminLogoutButton.classList.toggle("hidden", !isLoggedIn);
  adminMenuButton.classList.toggle("hidden", !isAdmin);
  adminStatus.textContent = isAdmin ? "Admin aktif" : "Perlu login";
  document.body.classList.toggle("auth-locked", !isLoggedIn);

  if (isLoggedIn) {
    hideLoginModal();
  } else {
    showLoginModal();
  }
}

function showLoginModal(options = {}) {
  if (options.openAdminAfterLogin) {
    openAdminAfterLogin = true;
  }

  document.body.classList.add("auth-locked");
  loginModal.classList.remove("hidden");
  loginStatus.textContent = "Masuk untuk membuka dashboard WebGIS.";
  document.getElementById("admin-username").focus();
}

function hideLoginModal() {
  loginModal.classList.add("hidden");
}

async function adminRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${getAdminToken()}`,
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      setAuthSession(null);
      updateAuthButtons();
      showLoginModal();
    }

    throw new Error(data.message || "Request admin gagal");
  }

  return data;
}

function formatCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "-";
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function renderAdminTable(rows) {
  const tbody = document.getElementById("admin-student-table-body");

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">Belum ada data yang cocok. Import CSV atau isi form manual terlebih dahulu.</td>
      </tr>
    `;
    adminTableStatus.textContent = "Belum ada data terbaru untuk ditampilkan.";
    return;
  }

  tbody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.no_bp)}</td>
        <td>${escapeHtml(row.nama_lengkap)}</td>
        <td>${escapeHtml(row.angkatan)}</td>
        <td>${escapeHtml(row.jenis_kelamin)}</td>
        <td>${escapeHtml(row.asal_sekolah)}</td>
        <td><span class="jalur-badge">${escapeHtml(row.jalur_masuk || "-")}</span></td>
        <td>${escapeHtml(formatCoordinate(row.latitude, row.longitude))}</td>
      </tr>
    `)
    .join("");

  adminTableStatus.textContent = `${rows.length} data terbaru ditampilkan dari database.`;
}

async function loadAdminRows() {
  const params = new URLSearchParams();
  const search = adminSearchInput.value.trim();

  if (search) {
    params.append("search", search);
  }

  const rows = await adminRequest(`/admin/mahasiswa?${params.toString()}`);
  renderAdminTable(rows);
}

async function loadAdminPanel() {
  if (!getAdminToken()) {
    showLoginModal({ openAdminAfterLogin: true });
    return;
  }

  if (getUserRole() !== "admin") {
    window.setContentView("dashboard");
    return;
  }

  window.setContentView("admin");
  adminStatus.textContent = "Memuat";
  await loadAdminRows();
  adminStatus.textContent = "Admin aktif";
}

window.openAdminView = loadAdminPanel;

adminLoginButton.addEventListener("click", showLoginModal);

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Memproses login...";

  const payload = {
    username: document.getElementById("admin-username").value.trim(),
    password: document.getElementById("admin-password").value,
  };

  try {
    const response = await fetch(`${ADMIN_API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login gagal");
    }

    setAuthSession(data.token, data.role);
    updateAuthButtons();
    hideLoginModal();

    if (openAdminAfterLogin && data.role === "admin") {
      openAdminAfterLogin = false;
      await loadAdminPanel();
      return;
    }

    openAdminAfterLogin = false;
    window.setContentView("dashboard");
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

adminLogoutButton.addEventListener("click", async () => {
  try {
    if (getAdminToken()) {
      await adminRequest("/auth/logout", { method: "POST" });
    }
  } catch (error) {
    // Token invalid tetap dibersihkan di sisi browser.
  }

  setAuthSession(null);
  updateAuthButtons();
  window.setContentView("dashboard");
});

document.getElementById("csv-import-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById("csv-file");
  const status = document.getElementById("csv-import-status");
  const file = fileInput.files[0];

  if (!file) {
    status.textContent = "Pilih file CSV terlebih dahulu.";
    return;
  }

  status.textContent = "Mengimport CSV...";

  try {
    const csv = await file.text();
    const result = await adminRequest("/admin/mahasiswa/import", {
      method: "POST",
      body: JSON.stringify({ csv }),
    });

    await loadAdminRows();
    status.textContent = `${result.imported} data berhasil diimport, ${result.rejected} baris ditolak. Pratinjau data terbaru sudah diperbarui.`;
  } catch (error) {
    status.textContent = error.message;
  }
});

document.getElementById("manual-student-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await adminRequest("/admin/mahasiswa", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    form.reset();
    await loadAdminRows();
  } catch (error) {
    alert(error.message);
  }
});

adminSearchInput.addEventListener("input", debounceAdmin(loadAdminRows));
document.getElementById("admin-refresh-button").addEventListener("click", () => {
  loadAdminRows();
});
generateGeocodingButton.addEventListener("click", () => {
  manualCoordinateSection.classList.remove("hidden");
  geocodingStatus.textContent = "Mode geocoding aktif. Tampilan koordinat sudah disiapkan.";
});

updateAuthButtons();
