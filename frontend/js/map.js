const API_BASE_URL = `${window.location.origin}/api`;
const DEFAULT_CENTER = [-0.9149, 100.4584];
const DEFAULT_ZOOM = 6;
const VIEW_PATHS = new Set(["landing", "login", "dashboard", "map", "admin"]);
const VIEW_ROUTES = {
  landing: "/",
  login: "/login",
  dashboard: "/admin/dashboard",
  map: "/admin/map",
  admin: "/admin/input",
};
const PROTECTED_VIEWS = new Set(["dashboard", "map", "admin"]);
const WEBGIS_ADMIN_TOKEN_KEY = "asalsi_admin_token";
const WEBGIS_PENDING_VIEW_KEY = "asalsi_pending_view";

const jalurColors = {
  SNBP:     "#3b82f6",
  SNBT:     "#10b981",
  MANDIRI:  "#f59e0b",
  PRESTASI: "#8b5cf6",
  AFIRMASI: "#f43f5e",
  LAINNYA:  "#94a3b8",
  KHUSUS:   "#06b6d4",
};
let jalurOptions = Object.keys(jalurColors);

let currentView = "marker";
let heatLayer = null;
let mapLoaded = false;
let filterMetadataLoaded = false;
let selectedMahasiswaProps = null;

const map = L.map("map", {
  zoomControl: true,
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

const markerCluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 48,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

map.addLayer(markerCluster);

function getFilters() {
  const search = document.getElementById("search-input").value.trim();
  const angkatan = document.getElementById("angkatan").value;
  const selectedJalur = Array.from(document.querySelectorAll('input[name="jalur"]:checked'))
    .map((input) => input.value);

  return {
    search,
    angkatan,
    jalur: selectedJalur,
  };
}

function buildQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.angkatan) {
    params.append("angkatan", filters.angkatan);
  }

  if (filters.search) {
    params.append("search", filters.search);
  }

  if (filters.jalur.length === 0) {
    params.append("jalur", "__none__");
  } else if (filters.jalur.length < jalurOptions.length) {
    filters.jalur.forEach((jalur) => params.append("jalur", jalur));
  }

  return params.toString();
}

async function loadMarkers(filters) {
  await ensureFilterMetadata();
  const activeFilters = filters || getFilters();
  const queryString = buildQueryString(activeFilters);
  const response = await fetch(`${API_BASE_URL}/mahasiswa/geojson?${queryString}`);

  if (!response.ok) {
    throw new Error("Gagal memuat data marker mahasiswa");
  }

  const geojson = await response.json();
  markerCluster.clearLayers();
  updateResultCount(geojson.features.length, "mahasiswa");

  const geojsonLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const jalur = feature.properties?.jalur_masuk || feature.properties?.jalur || "MANDIRI";
      const color = getJalurColor(jalur);

      return L.circleMarker(latlng, {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.82,
      });
    },
    onEachFeature: (feature, layer) => {
      const props = normalizeFeatureProperties(feature, layer.getLatLng?.());
      layer.bindPopup(createPopupContent(props));
      layer.on("click", () => {
        selectedMahasiswaProps = props;
        updateInfoPanel(props);
      });
    },
  });

  markerCluster.addLayer(geojsonLayer);

  if (markerCluster.getLayers().length > 0) {
    map.fitBounds(markerCluster.getBounds(), {
      padding: [24, 24],
      maxZoom: 12,
    });
  }
}

async function loadHeatmap(filters) {
  await ensureFilterMetadata();
  const activeFilters = filters || getFilters();
  const queryString = buildQueryString(activeFilters);
  const response = await fetch(`${API_BASE_URL}/mahasiswa/heatmap?${queryString}`);

  if (!response.ok) {
    throw new Error("Gagal memuat data heatmap mahasiswa");
  }

  const data = await response.json();
  const points = normalizeHeatmapPoints(data);

  if (heatLayer) {
    map.removeLayer(heatLayer);
  }

  heatLayer = L.heatLayer(points, {
    radius: 28,
    blur: 20,
    maxZoom: 13,
    gradient: {
      0.2:  "#3b82f6",
      0.5:  "#10b981",
      0.75: "#f59e0b",
      1.0:  "#f43f5e",
    },
  }).addTo(map);

  updateResultCount(points.length, "titik heatmap");
}

function normalizeHeatmapPoints(data) {
  const rows = Array.isArray(data) ? data : data.points || data.features || [];

  return rows
    .map((item) => {
      if (Array.isArray(item)) {
        return [Number(item[0]), Number(item[1]), Number(item[2] || 1)];
      }

      if (item.geometry?.coordinates) {
        const [longitude, latitude] = item.geometry.coordinates;
        return [Number(latitude), Number(longitude), Number(item.properties?.intensity || 1)];
      }

      return [Number(item.latitude), Number(item.longitude), Number(item.intensity || item.total || 1)];
    })
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
}

async function ensureFilterMetadata() {
  if (filterMetadataLoaded) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/stats/summary`);

    if (!response.ok) {
      throw new Error("Metadata filter tidak tersedia");
    }

    const summary = await response.json();
    const angkatanOptions = (summary.trenAngkatan || []).map((row) => row.angkatan).filter(Boolean);
    const detectedJalur = (summary.jalurMasuk || []).map((row) => row.jalur_masuk).filter(Boolean);

    if (detectedJalur.length > 0) {
      jalurOptions = detectedJalur;
    }

    renderAngkatanOptions(angkatanOptions);
    updateDataRangeChip(angkatanOptions);
  } catch (error) {
    // Filter tetap bisa dipakai dengan opsi default bila metadata gagal dimuat.
  }

  renderJalurFilters(jalurOptions);
  renderMapLegend(jalurOptions);
  filterMetadataLoaded = true;
}

function renderAngkatanOptions(angkatans) {
  const select = document.getElementById("angkatan");
  const selectedValue = select.value;

  select.innerHTML = '<option value="">Semua Angkatan</option>';
  angkatans.forEach((angkatan) => {
    const option = document.createElement("option");
    option.value = angkatan;
    option.textContent = angkatan;
    select.appendChild(option);
  });
  select.value = selectedValue;
}

function renderJalurFilters(options) {
  const container = document.getElementById("jalur-filter-options");

  container.innerHTML = options
    .map((jalur) => `
      <label>
        <input type="checkbox" name="jalur" value="${escapeAttribute(jalur)}" checked>
        <span>${escapeHtml(jalur)}</span>
      </label>
    `)
    .join("");

  document.querySelectorAll('input[name="jalur"]').forEach((input) => {
    input.addEventListener("change", reloadActiveLayer);
  });
}

function renderMapLegend(options) {
  document.getElementById("map-legend").innerHTML = options
    .map((jalur) => `
      <span><i class="legend-dot" style="background: ${getJalurColor(jalur)}"></i>${escapeHtml(jalur)}</span>
    `)
    .join("");
}

function updateDataRangeChip(angkatans) {
  const chip = document.getElementById("data-range-chip");

  if (chip && angkatans.length > 0) {
    chip.textContent = `Data ${angkatans[0]}-${angkatans[angkatans.length - 1]}`;
  }
}

function getJalurColor(jalur) {
  return jalurColors[String(jalur || "").toUpperCase()] || "#64748b";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function normalizeFeatureProperties(feature, latlng) {
  const props = { ...(feature.properties || {}) };

  if (feature.id && !props.id) {
    props.id = feature.id;
  }

  if (latlng) {
    props.latitude = Number(latlng.lat);
    props.longitude = Number(latlng.lng);
  }

  if (feature.geometry?.coordinates?.length >= 2) {
    const [longitude, latitude] = feature.geometry.coordinates;

    if (!Number.isFinite(Number(props.longitude))) {
      props.longitude = Number(longitude);
    }

    if (!Number.isFinite(Number(props.latitude))) {
      props.latitude = Number(latitude);
    }
  }

  return props;
}

function createPopupContent(props) {
  const nama = props.nama_lengkap || props.nama || "-";
  const noBp = props.no_bp || "-";
  const asalSekolah = props.asal_sekolah || "-";
  const alamat = props.alamat || props.address || "Alamat belum tersimpan";
  const angkatan = props.angkatan || "-";
  const jenisKelamin = formatJenisKelamin(props.jenis_kelamin);
  const jalur = props.jalur_masuk || props.jalur || "Belum tersedia";
  const koordinat = `${formatSingleCoordinate(props.latitude)}, ${formatSingleCoordinate(props.longitude)}`;
  const isAdmin = sessionStorage.getItem("asalsi_admin_role") === "admin";

  return `
    <div class="marker-popup location-detail-card">
      <div class="location-detail-heading">
        <span class="location-avatar">${escapeHtml(String(nama).charAt(0).toUpperCase())}</span>
        <div><small>Detail Lokasi</small><h3>${escapeHtml(nama)}</h3></div>
      </div>
      <div class="location-detail-grid">
        <p><span>No BP</span><strong>${escapeHtml(noBp)}</strong></p>
        <p><span>Angkatan</span><strong>${escapeHtml(angkatan)}</strong></p>
        <p><span>Jenis Kelamin</span><strong>${escapeHtml(jenisKelamin)}</strong></p>
        <p><span>Jalur Masuk</span><strong>${escapeHtml(jalur)}</strong></p>
      </div>
      <p class="location-detail-wide"><span>Asal Sekolah</span><strong>${escapeHtml(asalSekolah)}</strong></p>
      <p class="location-detail-wide"><span>Alamat</span><strong>${escapeHtml(alamat)}</strong></p>
      <p class="location-coordinate">${escapeHtml(koordinat)}</p>
      ${isAdmin ? `<a class="marker-popup-edit-button" href="/admin/input?id=${encodeURIComponent(props.id)}">Edit Data Mahasiswa</a>` : ""}
    </div>
  `;
}

function updateInfoPanel(props) {
  const latitude = Number(props.latitude);
  const longitude = Number(props.longitude);
  const coordinateText =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${formatSingleCoordinate(latitude)}, ${formatSingleCoordinate(longitude)}`
      : "Koordinat tidak tersedia";

  const nama = props.nama_lengkap || props.nama || "-";
  const isAdmin = sessionStorage.getItem("asalsi_admin_role") === "admin";
  document.getElementById("info-panel").innerHTML = `
    <div class="info-card-header">
      <span class="location-avatar">${escapeHtml(String(nama).charAt(0).toUpperCase())}</span>
      <div><small>Detail Lokasi Mahasiswa</small><h2>${escapeHtml(nama)}</h2></div>
    </div>
    <dl class="info-detail-list">
      <dt>No BP</dt>
      <dd>${escapeHtml(props.no_bp || "-")}</dd>
      <dt>Asal Sekolah</dt>
      <dd>${escapeHtml(props.asal_sekolah || "-")}</dd>
      <dt>Alamat</dt>
      <dd>${escapeHtml(props.alamat || props.address || "Alamat belum tersimpan")}</dd>
      <dt>Angkatan</dt>
      <dd>${escapeHtml(props.angkatan || "-")}</dd>
      <dt>Jenis Kelamin</dt>
      <dd>${escapeHtml(formatJenisKelamin(props.jenis_kelamin))}</dd>
      <dt>Jalur Masuk</dt>
      <dd>${escapeHtml(props.jalur_masuk || props.jalur || "Belum tersedia")}</dd>
      <dt>Koordinat</dt>
      <dd>${coordinateText}</dd>
    </dl>
    ${isAdmin ? `<a class="info-edit-button" href="/admin/input?id=${encodeURIComponent(props.id)}">Edit Data Mahasiswa</a>` : ""}
  `;
}

function formatJenisKelamin(value) {
  if (value === "L") return "Laki-laki";
  if (value === "P") return "Perempuan";
  return value || "-";
}

function formatSingleCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : "-";
}

function updateResultCount(total, label) {
  document.getElementById("filter-result-count").textContent = `${total} ${label} cocok dengan filter.`;
}

function debounce(callback, delay = 320) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

function setMapView(view) {
  currentView = view;
  document.getElementById("marker-view").classList.toggle("active", view === "marker");
  document.getElementById("heatmap-view").classList.toggle("active", view === "heatmap");
  document.getElementById("map-title").textContent = view === "marker" ? "Marker View" : "Heatmap View";

  if (view === "marker") {
    if (heatLayer) {
      map.removeLayer(heatLayer);
    }
    map.addLayer(markerCluster);
    loadMarkers();
    return;
  }

  map.removeLayer(markerCluster);
  loadHeatmap();
}

function getViewFromPathname() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    return "landing";
  }

  if (path === "/login") {
    return "login";
  }

  if (path === "/admin/dashboard") {
    return "dashboard";
  }

  if (path === "/admin/map") {
    return "map";
  }

  if (path === "/admin/input") {
    return "admin";
  }

  if (path === "/admin/input/add") {
    return "admin";
  }

  const view = path.split("/").filter(Boolean).pop();

  return VIEW_PATHS.has(view) ? view : "landing";
}

function syncViewRoute(view, replace = false) {
  const nextPath = VIEW_ROUTES[view] || "/";

  if (view === "admin" && window.location.pathname === "/admin/input/add") {
    return;
  }

  if (window.location.pathname === nextPath) {
    if (PROTECTED_VIEWS.has(view) && window.location.hash) {
      window.history.replaceState({ view }, "", `${window.location.origin}${nextPath}${window.location.search}`);
    }
    return;
  }

  const nextUrl = `${window.location.origin}${nextPath}${window.location.search}`;

  if (replace) {
    window.history.replaceState({ view }, "", nextUrl);
    return;
  }

  window.history.pushState({ view }, "", nextUrl);
}

function reloadActiveLayer() {
  if (currentView === "marker") {
    loadMarkers();
  } else {
    loadHeatmap();
  }
}

window.reloadMapData = reloadActiveLayer;

function syncMapAuthState() {
  if (selectedMahasiswaProps) {
    updateInfoPanel(selectedMahasiswaProps);
  }

  if (mapLoaded && currentView === "marker") {
    loadMarkers().catch(() => {
      // Tampilan lama tetap dipertahankan bila data marker gagal dimuat ulang.
    });
  }
}

window.addEventListener("asalsi:auth-changed", syncMapAuthState);

function isAuthenticated() {
  return Boolean(sessionStorage.getItem(WEBGIS_ADMIN_TOKEN_KEY));
}

function requestLoginForView(view) {
  sessionStorage.setItem(WEBGIS_PENDING_VIEW_KEY, view);

  if (window.location.pathname !== "/login") {
    window.history.pushState({ view: "login" }, "", `${window.location.origin}/login${window.location.search}`);
  }

  if (typeof window.openLoginModal === "function") {
    window.openLoginModal({ viewAfterLogin: view });
  }
}

document.getElementById("angkatan").addEventListener("change", reloadActiveLayer);
document.getElementById("search-input").addEventListener("input", debounce(reloadActiveLayer));
document.getElementById("marker-view").addEventListener("click", () => setMapView("marker"));
document.getElementById("heatmap-view").addEventListener("click", () => setMapView("heatmap"));

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "admin" && typeof window.openAdminView === "function") {
      window.openAdminView();
      return;
    }

    setContentView(button.dataset.view);

    if (button.dataset.scrollTarget) {
      setTimeout(() => {
        document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    }
  });
});

function setContentView(view) {
  const resolvedView = VIEW_PATHS.has(view) ? view : "landing";
  const visualView = resolvedView === "login" ? "landing" : resolvedView;

  if (PROTECTED_VIEWS.has(visualView) && !isAuthenticated()) {
    requestLoginForView(resolvedView);
    showVisualView("landing");
    return;
  }

  showVisualView(visualView);
  syncViewRoute(resolvedView);

  if (visualView === "map") {
    setTimeout(() => {
      map.invalidateSize();
      if (!mapLoaded) {
        loadMarkers();
        mapLoaded = true;
      }
    }, 50);
  }
}

function showVisualView(visualView) {
  document.querySelector(".landing-header").classList.toggle("hidden", visualView !== "landing");
  document.querySelector(".app-header").classList.toggle("hidden", visualView === "landing");
  document.getElementById("app-workspace").classList.toggle("hidden", visualView === "landing");

  document.querySelectorAll(".module-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === visualView);
  });

  document.querySelectorAll(".content-view").forEach((contentView) => {
    contentView.classList.toggle("active", contentView.id === `${visualView}-view`);
  });
}

window.setContentView = setContentView;

window.addEventListener("popstate", () => {
  setContentView(getViewFromPathname());
});

setContentView(getViewFromPathname());
