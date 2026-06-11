# AsalSI WebGIS

Pembangunan WebGIS untuk Pemetaan Persebaran Daerah Asal Mahasiswa Program Studi Sistem Informasi Universitas Andalas.

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Leaflet.js
- Backend: Express.js
- Database: PostgreSQL
- Spatial Service: OpenStreetMap dan Nominatim

## Database PostgreSQL

Nama database:

```text
asalsi_webgis
```

Salin `.env.example` menjadi `.env`, lalu isi koneksi PostgreSQL lokal:

```text
DATABASE_URL=postgres://postgres:password_postgresql_kamu@localhost:5432/webgis_si_unand
PG_ADMIN_DB=postgres
```

Import data awal:

```bash
node backend/import-mahasiswa-csv.js
```

## Struktur Project

```text
project/
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── routes/
│   │   ├── mahasiswa.js
│   │   └── stats.js
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── map.js
│   │   ├── dashboard.js
│   │   └── export.js
└── README.md
```
