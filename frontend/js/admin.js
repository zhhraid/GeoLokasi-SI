const ADMIN_API_BASE_URL = `${window.location.origin}/api`;
const ADMIN_TOKEN_KEY = "geosis_admin_token";
const ADMIN_ROLE_KEY = "geosis_admin_role";

const adminLoginButton = document.getElementById("admin-login-button");
const adminLogoutButton = document.getElementById("admin-logout-button");
const adminMenuButton = document.getElementById("admin-menu");
const loginModal = document.getElementById("login-modal");
const loginStatus = document.getElementById("login-status");
const adminStatus = document.getElementById("admin-status");
const adminSearchInput = document.getElementById("admin-search-input");
const adminJalurFilter = document.getElementById("admin-jalur-filter");
const adminAngkatanFilter = document.getElementById("admin-angkatan-filter");
const adminGenderFilter = document.getElementById("admin-gender-filter");
const adminResetFilterButton = document.getElementById("admin-reset-filter");
const adminTableStatus = document.getElementById("admin-table-status");
const adminTablePagination = document.getElementById("admin-table-pagination");
const adminPageInfo = document.getElementById("admin-page-info");
const adminPreviousPageButton = document.getElementById("admin-previous-page");
const adminNextPageButton = document.getElementById("admin-next-page");
const manualNoBpInput = document.getElementById("manual-no-bp");
const geocodingStatus = document.getElementById("geocoding-status");
const manualAddressInput = document.getElementById("manual-alamat");
const manualLatitudeInput = document.getElementById("manual-latitude");
const manualLongitudeInput = document.getElementById("manual-longitude");
const manualGeocodingButton = document.getElementById("manual-geocoding-button");
const manualGeocodingStatus = document.getElementById("manual-geocoding-status");
const editAddressInput = document.getElementById("edit-alamat");
const editLatitudeInput = document.getElementById("edit-latitude");
const editLongitudeInput = document.getElementById("edit-longitude");
const editGeocodingButton = document.getElementById("edit-geocoding-button");
const editGeocodingStatus = document.getElementById("edit-geocoding-status");
const PENDING_VIEW_KEY = "geosis_pending_view";
let openAdminAfterLogin = false;
let viewAfterLogin = null;
let adminCurrentPage = 1;
let adminTotalPages = 1;
let adminFilterOptionsLoaded = false;
let adminRowsById = new Map();

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

  window.dispatchEvent(
    new CustomEvent("geosis:auth-changed", {
      detail: {
        authenticated: Boolean(token),
        role: token ? role || "user" : null,
      },
    }),
  );
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

  if (isLoggedIn) {
    hideLoginModal();
  }

  if (!isAdmin && !document.getElementById("edit-student-modal").classList.contains("hidden")) {
    closeEditStudentModal();
  }
}

function showLoginModal(options = {}) {
  if (options.openAdminAfterLogin) {
    openAdminAfterLogin = true;
  }

  if (options.viewAfterLogin) {
    viewAfterLogin = options.viewAfterLogin;
    sessionStorage.setItem(PENDING_VIEW_KEY, options.viewAfterLogin);
  }

  if (window.location.pathname !== "/login") {
    window.history.pushState({ view: "login" }, "", `${window.location.origin}/login${window.location.search}`);
  }

  if (typeof window.setContentView === "function") {
    window.setContentView("login");
  }

  document.body.classList.add("modal-open");
  loginModal.classList.remove("hidden");
  loginStatus.textContent = "Masuk untuk membuka dashboard WebGIS.";
  setTimeout(() => document.getElementById("login-email").focus(), 50);
}

function hideLoginModal() {
  document.body.classList.remove("modal-open");
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

async function loadAdminFilterOptions() {
  if (adminFilterOptionsLoaded) {
    return;
  }

  const options = await adminRequest("/admin/mahasiswa/filters");

  adminJalurFilter.innerHTML = [
    '<option value="">Semua Jalur</option>',
    ...options.jalurMasuk.map(
      (jalur) => `<option value="${escapeHtml(jalur)}">${escapeHtml(jalur)}</option>`,
    ),
  ].join("");
  adminAngkatanFilter.innerHTML = [
    '<option value="">Semua Angkatan</option>',
    ...options.angkatan.map(
      (angkatan) => `<option value="${escapeHtml(angkatan)}">${escapeHtml(angkatan)}</option>`,
    ),
  ].join("");
  adminFilterOptionsLoaded = true;
}

function renderAdminTable(rows, pagination) {
  const tbody = document.getElementById("admin-student-table-body");
  adminRowsById = new Map(rows.map((row) => [String(row.id), row]));
  adminCurrentPage = pagination.page;
  adminTotalPages = pagination.totalPages;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">Belum ada data yang cocok. Import CSV atau isi form manual terlebih dahulu.</td>
      </tr>
    `;
    adminTableStatus.textContent = "Belum ada data untuk ditampilkan.";
    adminTablePagination.classList.add("hidden");
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
        <td>${escapeHtml(row.alamat || "-")}</td>
        <td><span class="jalur-badge">${escapeHtml(row.jalur_masuk || "-")}</span></td>
        <td>${escapeHtml(formatCoordinate(row.latitude, row.longitude))}</td>
        <td>
          <div class="table-row-actions">
            <button class="table-action-button edit" type="button" data-action="edit" data-id="${row.id}" aria-label="Edit ${escapeHtml(row.nama_lengkap)}" title="Edit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="table-action-button delete" type="button" data-action="delete" data-id="${row.id}" aria-label="Hapus ${escapeHtml(row.nama_lengkap)}" title="Hapus">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `)
    .join("");

  const firstRow = (pagination.page - 1) * pagination.pageSize + 1;
  const lastRow = firstRow + rows.length - 1;
  adminTableStatus.textContent = `Menampilkan data ${firstRow}-${lastRow} dari ${pagination.total} mahasiswa.`;
  adminPageInfo.textContent = `Halaman ${pagination.page} dari ${pagination.totalPages}`;
  adminPreviousPageButton.disabled = pagination.page <= 1;
  adminNextPageButton.disabled = pagination.page >= pagination.totalPages;
  adminTablePagination.classList.remove("hidden");
}

function closeEditStudentModal() {
  document.getElementById("edit-student-modal").classList.add("hidden");
  document.body.classList.remove("modal-open");

  const url = new URL(window.location.href);
  if (url.searchParams.has("id")) {
    url.searchParams.delete("id");
    window.history.replaceState({ view: "admin" }, "", `${url.pathname}${url.search}`);
  }
}

function openEditStudentModal(row) {
  if (!row || getUserRole() !== "admin") return;

  const fields = {
    "edit-student-id": row.id,
    "edit-no-bp": row.no_bp,
    "edit-angkatan": row.angkatan,
    "edit-nama": row.nama_lengkap,
    "edit-jk": row.jenis_kelamin,
    "edit-jalur": row.jalur_masuk,
    "edit-sekolah": row.asal_sekolah,
    "edit-alamat": row.alamat,
    "edit-latitude": row.latitude,
    "edit-longitude": row.longitude,
  };

  Object.entries(fields).forEach(([id, value]) => {
    document.getElementById(id).value = value ?? "";
  });
  document.getElementById("edit-student-status").textContent =
    "Perbarui data lalu tekan Simpan Perubahan.";
  editGeocodingStatus.textContent = "Tekan Geocoding Otomatis jika alamat berubah.";
  document.getElementById("edit-student-modal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

window.openStudentEditor = openEditStudentModal;

async function openStudentEditorFromUrl() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) return;

  try {
    const row = await adminRequest(`/admin/mahasiswa/${encodeURIComponent(id)}`);
    openEditStudentModal(row);
  } catch (error) {
    adminTableStatus.textContent = error.message;
  }
}

function setAdminEntryPanel(panelName) {
  const activePanel = panelName === "manual" ? "manual" : "import";

  document
    .getElementById("import-entry-panel")
    ?.classList.toggle("hidden", activePanel !== "import");
  document
    .getElementById("manual-entry-panel")
    ?.classList.toggle("hidden", activePanel !== "manual");

  document.querySelectorAll("[data-admin-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminPanel === activePanel);
  });
}

function setAdminPageMode(mode, options = {}) {
  const isAddMode = mode === "add";

  document.getElementById("admin-list-panel")?.classList.toggle("hidden", isAddMode);
  document.getElementById("admin-add-panel")?.classList.toggle("hidden", !isAddMode);

  if (isAddMode) {
    setAdminEntryPanel(options.entryPanel || "import");
  }

  if (options.updateRoute !== false) {
    const nextPath = isAddMode ? "/admin/input/add" : "/admin/input";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ view: "admin", mode }, "", `${window.location.origin}${nextPath}${window.location.search}`);
    }
  }
}

function syncAdminPageModeFromPath() {
  setAdminPageMode(
    window.location.pathname.replace(/\/+$/, "") === "/admin/input/add" ? "add" : "list",
    { updateRoute: false },
  );
}

async function loadAdminRows(page = adminCurrentPage) {
  const params = getAdminFilterParams();
  params.append("page", page);

  const result = await adminRequest(`/admin/mahasiswa?${params.toString()}`);
  renderAdminTable(result.rows, result.pagination);
}

function getAdminFilterParams() {
  const params = new URLSearchParams();
  const search = adminSearchInput.value.trim();
  const jalur = adminJalurFilter.value;
  const angkatan = adminAngkatanFilter.value;
  const jenisKelamin = adminGenderFilter.value;

  if (search) {
    params.append("search", search);
  }

  if (jalur) {
    params.append("jalur", jalur);
  }

  if (angkatan) {
    params.append("angkatan", angkatan);
  }

  if (jenisKelamin) {
    params.append("jenis_kelamin", jenisKelamin);
  }

  return params;
}

async function getAdminExportData() {
  const params = getAdminFilterParams();
  const result = await adminRequest(`/admin/mahasiswa/export?${params.toString()}`);

  return {
    rows: result.rows,
    filters: {
      pencarian: adminSearchInput.value.trim() || "Semua",
      jalurMasuk: adminJalurFilter.value || "Semua Jalur",
      angkatan: adminAngkatanFilter.value || "Semua Angkatan",
      jenisKelamin:
        adminGenderFilter.value === "L"
          ? "Laki-laki"
          : adminGenderFilter.value === "P"
            ? "Perempuan"
            : "Semua Jenis Kelamin",
    },
  };
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
  syncAdminPageModeFromPath();
  adminStatus.textContent = "Memuat";
  await loadAdminFilterOptions();
  await loadAdminRows();
  await openStudentEditorFromUrl();
  adminStatus.textContent = "Admin aktif";
}

window.openAdminView = loadAdminPanel;
window.openLoginModal = showLoginModal;
window.getAdminExportData = getAdminExportData;

adminLoginButton.addEventListener("click", () => showLoginModal({ viewAfterLogin: "dashboard" }));

document.querySelectorAll(".login-trigger").forEach((button) => {
  button.addEventListener("click", () => showLoginModal({ viewAfterLogin: "dashboard" }));
});

document.querySelectorAll("[data-admin-panel]").forEach((button) => {
  button.addEventListener("click", () => setAdminEntryPanel(button.dataset.adminPanel));
});

document.getElementById("admin-add-button")?.addEventListener("click", () => {
  setAdminPageMode("add");
});

document.getElementById("admin-back-button")?.addEventListener("click", () => {
  setAdminPageMode("list");
});

window.addEventListener("popstate", () => {
  if (window.location.pathname.startsWith("/admin/input")) {
    syncAdminPageModeFromPath();
  }
});

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Memproses login...";

  const payload = {
    email: document.getElementById("login-email").value.trim(),
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
      sessionStorage.removeItem(PENDING_VIEW_KEY);
      await loadAdminPanel();
      return;
    }

    openAdminAfterLogin = false;
    const nextView = viewAfterLogin || sessionStorage.getItem(PENDING_VIEW_KEY) || "dashboard";
    viewAfterLogin = null;
    sessionStorage.removeItem(PENDING_VIEW_KEY);
    window.setContentView(nextView === "admin" && data.role !== "admin" ? "dashboard" : nextView);
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
  sessionStorage.removeItem(PENDING_VIEW_KEY);
  window.setContentView("landing");
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

    await loadAdminRows(1);
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

editGeocodingButton.addEventListener("click", async () => {
  const alamat = editAddressInput.value.trim();

  if (!alamat) {
    editGeocodingStatus.textContent = "Isi alamat terlebih dahulu.";
    editAddressInput.focus();
    return;
  }

  editGeocodingButton.disabled = true;
  editGeocodingStatus.textContent = "Mencari koordinat alamat...";

  try {
    const coordinates = await adminRequest("/admin/geocode", {
      method: "POST",
      body: JSON.stringify({ alamat }),
    });

    editLatitudeInput.value = Number(coordinates.latitude).toFixed(8);
    editLongitudeInput.value = Number(coordinates.longitude).toFixed(8);
    editGeocodingStatus.textContent = coordinates.accuracy === "fallback"
      ? "Alamat tidak dikenali. Koordinat memakai titik fallback Kota Padang; ubah manual jika tidak sesuai."
      : coordinates.approximate
        ? "Alamat lengkap tidak ditemukan. Koordinat menggunakan perkiraan wilayah terdekat; periksa hasilnya sebelum menyimpan."
        : "Koordinat ditemukan. Simpan perubahan untuk menerapkan data baru.";
  } catch (error) {
    editGeocodingStatus.textContent = error.message;
  } finally {
    editGeocodingButton.disabled = false;
  }
});

editAddressInput.addEventListener("input", () => {
  editLatitudeInput.value = "";
  editLongitudeInput.value = "";
  editGeocodingStatus.textContent = "Alamat berubah. Tekan Geocoding Otomatis untuk memperbarui koordinat.";
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
    await loadAdminRows(1);
    manualGeocodingStatus.textContent = result.geocoded
      ? "Alamat berhasil diterjemahkan dan data disimpan."
      : "Data dengan koordinat hasil geocoding berhasil disimpan.";
  } catch (error) {
    alert(error.message);
  }
});

adminSearchInput.addEventListener("input", debounceAdmin(() => loadAdminRows(1)));
[adminJalurFilter, adminAngkatanFilter, adminGenderFilter].forEach((filter) => {
  filter.addEventListener("change", () => loadAdminRows(1));
});
adminResetFilterButton.addEventListener("click", () => {
  adminSearchInput.value = "";
  adminJalurFilter.value = "";
  adminAngkatanFilter.value = "";
  adminGenderFilter.value = "";
  loadAdminRows(1);
});
document.getElementById("admin-refresh-button").addEventListener("click", () => {
  loadAdminRows(adminCurrentPage);
});
adminPreviousPageButton.addEventListener("click", () => {
  if (adminCurrentPage > 1) {
    loadAdminRows(adminCurrentPage - 1);
  }
});
adminNextPageButton.addEventListener("click", () => {
  if (adminCurrentPage < adminTotalPages) {
    loadAdminRows(adminCurrentPage + 1);
  }
});

document.getElementById("admin-student-table-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const row = adminRowsById.get(button.dataset.id);
  if (button.dataset.action === "edit") {
    openEditStudentModal(row);
    return;
  }

  if (!row || !window.confirm(`Hapus data ${row.nama_lengkap} (${row.no_bp})?`)) return;

  button.disabled = true;
  try {
    await adminRequest(`/admin/mahasiswa/${row.id}`, { method: "DELETE" });
    await loadAdminRows(adminCurrentPage);
    if (typeof window.reloadMapData === "function") {
      window.reloadMapData();
    }
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

document.getElementById("edit-student-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = payload.id;
  delete payload.id;
  const status = document.getElementById("edit-student-status");
  status.textContent = "Menyimpan perubahan...";

  try {
    const result = await adminRequest(`/admin/mahasiswa/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    status.textContent = result.message;
    await loadAdminRows(adminCurrentPage);
    if (typeof window.reloadMapData === "function") {
      window.reloadMapData();
    }
    setTimeout(closeEditStudentModal, 450);
  } catch (error) {
    status.textContent = error.message;
  }
});

document.getElementById("edit-student-close").addEventListener("click", closeEditStudentModal);
document.getElementById("edit-student-cancel").addEventListener("click", closeEditStudentModal);
document.getElementById("edit-student-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeEditStudentModal();
});
updateAuthButtons();

if (window.location.pathname.replace(/\/+$/, "") === "/login" && !getAdminToken()) {
  showLoginModal({ viewAfterLogin: sessionStorage.getItem(PENDING_VIEW_KEY) || "dashboard" });
}

if (
  window.location.pathname.startsWith("/admin/input") &&
  getAdminToken() &&
  getUserRole() === "admin"
) {
  loadAdminPanel().catch((error) => {
    adminStatus.textContent = error.message;
  });
}
