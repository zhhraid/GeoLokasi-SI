
# GeoSIS WebGIS

GeoSIS adalah aplikasi WebGIS untuk memetakan persebaran daerah asal mahasiswa Sistem Informasi Universitas Andalas.

## Struktur Project

```text
backend/              Server Express, koneksi database, import data, dan API routes
backend/routes/       Endpoint auth, admin, mahasiswa, dan statistik
frontend/             Halaman web, CSS, JavaScript, dan aset gambar
frontend/css/         Source Tailwind dan hasil build CSS
frontend/images/      Logo, foto tim, dan gambar pendukung landing page
artifacts/            Dokumen/laporan pendukung proyek
```

## File Data Penting

- `backend/seed-mahasiswa.csv`: data awal untuk database saat deploy.
- `backend/update_alamat_mahasiswa.sql`: SQL untuk melengkapi alamat mahasiswa.
- `template-import-mahasiswa.csv` dan `template-import-mahasiswa.xlsx`: template unduhan dari halaman admin.

## Menjalankan Lokal

```bash
npm install
npm run build
npm start
```

Aplikasi berjalan di `http://localhost:3000`.
