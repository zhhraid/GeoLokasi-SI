const API_BASE_URL = "http://localhost:3000/api";
const DEFAULT_CENTER = [-0.9149, 100.4584];
const DEFAULT_ZOOM = 6;

const jalurColors = {
  SNBP: "#2563eb",
  SNBT: "#16a34a",
  Mandiri: "#f97316",
};

let currentView = "marker";
let heatLayer = null;
let mapLoaded = false;

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
  const angkatan = document.getElementById("angkatan").value;
  const selectedJalur = Array.from(document.querySelectorAll('input[name="jalur"]:checked'))
    .map((input) => input.value);

  return {
    angkatan,
    jalur: selectedJalur,
  };
}

function buildQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.angkatan) {
    params.append("angkatan", filters.angkatan);
  }

  filters.jalur.forEach((jalur) => {
    params.append("jalur", jalur);
  });

  return params.toString();
}

async function loadMarkers(filters = getFilters()) {
  const queryString = buildQueryString(filters);
  const response = await fetch(`${API_BASE_URL}/mahasiswa/geojson?${queryString}`);

  if (!response.ok) {
    throw new Error("Gagal memuat data marker mahasiswa");
  }

  const geojson = await response.json();
  markerCluster.clearLayers();

  const geojsonLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const jalur = feature.properties?.jalur_masuk || feature.properties?.jalur || "Mandiri";
      const color = jalurColors[jalur] || "#64748b";

      return L.circleMarker(latlng, {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.82,
      });
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const popupContent = createPopupContent(props);

      layer.bindPopup(popupContent);
      layer.on("click", () => updateInfoPanel(props));
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

async function loadHeatmap(filters = getFilters()) {
  const queryString = buildQueryString(filters);
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
      0.25: "#2563eb",
      0.55: "#16a34a",
      0.85: "#f97316",
    },
  }).addTo(map);
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

function createPopupContent(props) {
  const nama = props.nama_lengkap || props.nama || "-";
  const noBp = props.no_bp || "-";
  const asalSekolah = props.asal_sekolah || "-";
  const angkatan = props.angkatan || "-";
  const jenisKelamin = formatJenisKelamin(props.jenis_kelamin);
  const jalur = props.jalur_masuk || props.jalur || "Belum tersedia";

  return `
    <div class="marker-popup">
      <h3>${nama}</h3>
      <p><strong>No BP:</strong> ${noBp}</p>
      <p><strong>Asal Sekolah:</strong> ${asalSekolah}</p>
      <p><strong>Angkatan:</strong> ${angkatan}</p>
      <p><strong>Jenis Kelamin:</strong> ${jenisKelamin}</p>
      <p><strong>Jalur Masuk:</strong> ${jalur}</p>
    </div>
  `;
}

function updateInfoPanel(props) {
  document.getElementById("info-panel").innerHTML = `
    <h2>Info Mahasiswa</h2>
    <dl>
      <dt>Nama</dt>
      <dd>${props.nama_lengkap || props.nama || "-"}</dd>
      <dt>No BP</dt>
      <dd>${props.no_bp || "-"}</dd>
      <dt>Asal Sekolah</dt>
      <dd>${props.asal_sekolah || "-"}</dd>
      <dt>Angkatan</dt>
      <dd>${props.angkatan || "-"}</dd>
      <dt>Jenis Kelamin</dt>
      <dd>${formatJenisKelamin(props.jenis_kelamin)}</dd>
      <dt>Jalur Masuk</dt>
      <dd>${props.jalur_masuk || props.jalur || "Belum tersedia"}</dd>
      <dt>Koordinat</dt>
      <dd>${formatCoordinate(props.latitude)}, ${formatCoordinate(props.longitude)}</dd>
    </dl>
  `;
}

function formatJenisKelamin(value) {
  if (value === "L") return "Laki-laki";
  if (value === "P") return "Perempuan";
  return value || "-";
}

function formatCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : "-";
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

function reloadActiveLayer() {
  if (currentView === "marker") {
    loadMarkers();
  } else {
    loadHeatmap();
  }
}

document.getElementById("angkatan").addEventListener("change", reloadActiveLayer);
document.querySelectorAll('input[name="jalur"]').forEach((input) => {
  input.addEventListener("change", reloadActiveLayer);
});
document.getElementById("marker-view").addEventListener("click", () => setMapView("marker"));
document.getElementById("heatmap-view").addEventListener("click", () => setMapView("heatmap"));

document.querySelectorAll(".module-button").forEach((button) => {
  button.addEventListener("click", () => setContentView(button.dataset.view));
});

function setContentView(view) {
  document.querySelectorAll(".module-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  document.getElementById("dashboard-view").classList.toggle("active", view === "dashboard");
  document.getElementById("map-view").classList.toggle("active", view === "map");

  if (view === "map") {
    setTimeout(() => {
      map.invalidateSize();
      if (!mapLoaded) {
        loadMarkers();
        mapLoaded = true;
      }
    }, 50);
  }
}

setContentView("dashboard");
