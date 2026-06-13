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
const geocodingStatus = document.getElementById("geocoding-status");
const manualAddressInput = document.getElementById("manual-alamat");
const manualLatitudeInput = document.getElementById("manual-latitude");
const manualLongitudeInput = document.getElementById("manual-longitude");
const manualGeocodingButton = document.getElementById("manual-geocoding-button");
const manualGeocodingStatus = document.getElementById("manual-geocoding-status");
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("File Excel tidak dapat dibaca"));
    reader.readAsDataURL(file);
  });
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

    const rejectedDetails = data.rejectedRows
      ?.slice(0, 3)
      .map((row) => `Baris ${row.rowNumber}: ${row.errors.join(", ")}`)
      .join("; ");
    const details = data.errors?.join(", ") || rejectedDetails || data.error;
    throw new Error(details ? `${data.message}: ${details}` : data.message || "Request admin gagal");
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
    status.textContent = "Pilih file CSV atau Excel terlebih dahulu.";
    return;
  }

  status.textContent = "Membaca file, melakukan geocoding, dan menyimpan data...";
  geocodingStatus.textContent = "Geocoding sedang berjalan. Proses dapat memerlukan waktu untuk banyak alamat unik.";

  try {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const payload = isExcel
      ? { excelBase64: await fileToBase64(file) }
      : { csv: await file.text() };
    const result = await adminRequest("/admin/mahasiswa/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    await loadAdminRows();
    const sheetInfo = result.sourceSheet ? ` dari sheet ${result.sourceSheet}` : "";
    status.textContent = `${result.imported} data berhasil diimport${sheetInfo}, ${result.geocoded} alamat di-geocoding, ${result.rejected} baris ditolak.`;
    geocodingStatus.textContent = "Geocoding selesai.";
  } catch (error) {
    status.textContent = error.message;
    geocodingStatus.textContent = error.message;
  }
});

manualGeocodingButton.addEventListener("click", async () => {
  const alamat = manualAddressInput.value.trim();

  if (!alamat) {
    manualGeocodingStatus.textContent = "Isi alamat terlebih dahulu.";
    manualAddressInput.focus();
    return;
  }

  manualGeocodingButton.disabled = true;
  manualGeocodingStatus.textContent = "Mencari koordinat alamat...";

  try {
    const coordinates = await adminRequest("/admin/geocode", {
      method: "POST",
      body: JSON.stringify({ alamat }),
    });

    manualLatitudeInput.value = Number(coordinates.latitude).toFixed(8);
    manualLongitudeInput.value = Number(coordinates.longitude).toFixed(8);
    manualGeocodingStatus.textContent = coordinates.accuracy === "fallback"
      ? "Alamat tidak dikenali. Koordinat memakai titik fallback Kota Padang; ubah manual jika tidak sesuai."
      : coordinates.approximate
        ? "Alamat lengkap tidak ditemukan. Koordinat menggunakan perkiraan wilayah terdekat; periksa hasilnya sebelum menyimpan."
        : "Koordinat ditemukan. Periksa hasilnya lalu simpan data.";
  } catch (error) {
    manualLatitudeInput.value = "";
    manualLongitudeInput.value = "";
    manualGeocodingStatus.textContent = error.message;
  } finally {
    manualGeocodingButton.disabled = false;
  }
});

manualAddressInput.addEventListener("input", () => {
  manualLatitudeInput.value = "";
  manualLongitudeInput.value = "";
  manualGeocodingStatus.textContent = "Alamat berubah. Tekan Geocoding Otomatis untuk memperbarui koordinat.";
});

document.getElementById("manual-student-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  if (!payload.latitude || !payload.longitude) {
    manualGeocodingStatus.textContent = "Tekan Geocoding Otomatis sampai latitude dan longitude terisi.";
    return;
  }

  try {
    const result = await adminRequest("/admin/mahasiswa", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    form.reset();
    await loadAdminRows();
    manualGeocodingStatus.textContent = result.geocoded
      ? "Alamat berhasil diterjemahkan dan data disimpan."
      : "Data dengan koordinat hasil geocoding berhasil disimpan.";
  } catch (error) {
    alert(error.message);
  }
});

adminSearchInput.addEventListener("input", debounceAdmin(loadAdminRows));
document.getElementById("admin-refresh-button").addEventListener("click", () => {
  loadAdminRows();
});
updateAuthButtons();
