# Serso Experience OS

Sistem monitoring review pelanggan untuk instalasi layanan (pool/branch), dibangun untuk kebutuhan operasional harian.

Alurnya sederhana. Pelanggan memindai satu QR all-in-one, mengisi form rating satu sampai lima bintang pada tiga dimensi (pemasangan, grooming, pelayanan) disertai komentar dan nomor struk. Admin menerima hasilnya di dashboard: menandai status, memberi catatan, dan menindaklanjuti alert review negatif sampai tuntas.

## Instance

Dua instance berjalan berdampingan di satu VPS dari repo yang sama.

| Instance | Domain | Container | Port host | Database |
|----------|--------|-----------|-----------|----------|
| v1 | review.kemscloud.web.id | `serso-review-monitor-app-1` | `${PORT:-3000}` | `serso` |
| v2 | reviewv2.kemscloud.web.id | `serso-review-monitor-app-full-v2-1` | `${PORT_FULL_V2:-9313}` | `serso_v2` |

Seluruh pengembangan sekarang berpusat di v2. Cabang kerja aktif adalah `fix/deploy-runtime` (fork `AxionAgent/serso-review-monitor`), diajukan ke `codex31/serso-review-monitor` lewat PR #1. Cabang lokal `v2` berisi commit yang identik.

## Teknologi

| Lapisan | Pilihan |
|---------|---------|
| Frontend | React, Vite, wouter, Tailwind CSS v4, shadcn/ui, TanStack React Query |
| Backend | Express dengan tRPC v11 dalam satu router |
| Database | MySQL 8 melalui drizzle-orm, 10 migrasi tersimpan di `drizzle/` |
| Deploy | Docker Compose, satu Dockerfile multi-stage, Caddy reverse proxy, Cloudflare |

## Arsitektur

```
Client (React SPA, dark/light) -> Express -> tRPC router (server/routers.ts)
                                             v
                           server/db.ts: akses MySQL + scoping role
                                             v
        MySQL (serso / serso_v2). Tabel: users, branches, teams, qr_codes,
        reviews, review_alerts, audit_logs, settings
```

Tiga modul yang membedakan perilaku sistem dari CRUD biasa:

- `server/store.ts` dan `server/store.json`. Katalog 742 store. Kode store diekstrak dari `receiptNo`; misalnya tiket `MB.5A.20260910.106` menunjuk store `5A`, yaitu HCIR SELMA SINGKAWANG G M. Kode yang tidak ada di katalog diberi label "Unknown".
- `server/analytics.ts`. Pembuat "Summary Review": rekap mingguan dirender deterministik di sisi server, tanpa LLM. Window 7 hari dan cabang berkode TEST dikecualikan.
- `server/v2/server.ts`. Server v2 yang sangat tipis; hanya menyediakan `/healthz`, tanpa instrumentasi metrics.

## Fitur

### Formulir publik

- Satu QR all-in-one mengarah ke `/r/:code` dan melayani semua store sekaligus; store diidentifikasi belakangan dari nomor struk.
- Formisi tiga sub-rating (pemasangan, grooming, pelayanan), komentar, dan nomor struk.
- Validasi QR aktif di sisi server. Rating overall di bawah ambang langsung memicu alert.

### Autentikasi dan otorisasi

- Login lokal username dan password melalui env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SUPERADMIN_PASSWORD`). Kolom password bertipe `password` dengan placeholder kosong.
- Sesi berupa cookie `app_session_id` berisi JWT, HttpOnly, masa berlaku satu tahun.
- Dua tingkat akses: super admin melihat semuanya, branch admin terbatas pada pool-nya sendiri. Pembatasan ditegakkan di lapisan kueri, bukan hanya di UI.

### Dashboard Overview

- Deretan KPI: total review, rata-rata rating, open, review hari ini, month to date, rasio positif terhadap negatif dibanding ambang.
- Distribusi rating, tren harian, dan skor per dimensi dalam bentuk grafik area dan bar.
- Analitik agregat per branch, per tim, dan per store. Perhitungan store memakai prefiks tiket, bukan nama pool.
- Panel Alert Center berisi ringkasan critical, attention, dan resolved, plus tiga alert open terakhir. Label yang ditampilkan adalah nama store (`storeName`), dengan branch sebagai fallback.

### Manajemen review

- Tabel review dengan pencarian tertunda 300 ms. Refetch per huruf sengaja dihindari karena mengganggu keyboard Android.
- Filter status dan filter store melalui dropdown yang tidak boleh kosong.
- Paginasi dengan ukuran halaman pilihan, sorting kolom tanggal, store, rating, dan status. Klik ketiga pada kolom sort mengembalikan urutan default.
- Ekspor seluruh hasil terfilter ke XLSX, ODS, atau CSV.
- Panel detail menampilkan tiga sub-rating, komentar, dan riwayat. Tombol status hanya Open dan Resolved; status `new` tampil sebagai badge kecil di samping Open, lengkap dengan titik unread.
- Alur status bersifat searah. Archive hanya untuk super admin dan bersifat final.
- Catatan resolve tetap tersimpan ketika status bergerak bolak-balik, dan dapat disunting kembali.
- Modal History berisi seluruh jejak perubahan sebuah review. Sunting dan hapus entri log dikhususkan untuk super admin.
- Membuka detail review otomatis menandai `readAt`, titik unread hilang.
- Kolom lama "Tim Instalasi" dan "Sumber QR" sudah dihapus dari kartu detail karena membebani layar.

### Alert

- Alert `critical` atau `attention` dibuat otomatis saat rating overall jatuh di bawah ambang (default 3.5, dapat diatur).
- Halaman Alerts dilengkapi paginasi dan pencarian lintas receipt, pesan alert, komentar, dan store.
- Resolve alert disertai catatan opsional. Menyelesaikan alert sekaligus menandainya sebagai terbaca.

### Notifikasi

- Ikon bell di header menampilkan gabungan review dan alert terbaru dengan badge hitungan unread yang ditutup pada "9+".
- Tombol "Tandai semua dibaca" mengisi `readAt` secara massal pada review dan alert, tanpa mengubah status kerja apa pun.
- Mengklik salah satu item membawa admin langsung ke detail review terkait.

### Analytics

- Tab Summary Review merangkum 7 hari terakhir secara otomatis: rata-rata per store dengan dua desimal, review tertinggi dan terendah, serta komentar representative per store.

### QR codes

- Buat, aktif nonaktifkan, dan hapus kode QR per branch.
- Salin tautan `/r/:code` dan pratinjau gambar QR dari halaman yang sama.

### Pengaturan

- Company name, judul halaman review, pesan ucapan terima kasih, ambang review negatif, dan zona waktu.
- Danger zone berisi penghapusan permanen seluruh review ter-archive, dikemas dengan dialog konfirmasi.
- Branch, tim, dan akun admin tidak dikelola lewat UI. Penanganannya melalui seed atau akses DB langsung.

### Tampilan

- Dark dan light mode memakai ikon matahari dan bulan, letaknya di kiri bell. Preferensi disimpan di localStorage dan seluruh panel memiliki varian `dark:`.
- Versi aplikasi dihitung dari riwayat commit dengan pola `1.<jumlah feat>.<jumlah fix>`, disuntik saat build oleh `vite.config.ts`, tampil di sidebar kiri bawah logo.
- Seluruh dropdown menutup sendiri ketika area luarnya diklik.

## API tRPC

| Group | Prosedur |
|-------|----------|
| auth | login, logout, me |
| public | submit |
| admin | overview, reviews, review, search, notifications, markAllNotificationsRead, latestReviewAt, updateReviewStatus, updateReviewNote, markReviewRead, reviewHistory, editReviewHistory, deleteReviewHistory, assignReview, deleteReview, deleteAllReviews, deleteArchivedReviews, analyticsRecap, alerts, resolveAlert, qrCodes, createQRCode, toggleQRCode, deleteQRCode, exportReviews, settings, updateSettings |

Prosedur bertanda superadmin only: editReviewHistory, deleteReviewHistory, deleteReview, deleteAllReviews, deleteArchivedReviews.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # isi DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, SUPERADMIN_PASSWORD
npm run db:push        # generate lalu migrate dari drizzle/schema.ts
npx tsx server/seed.ts # seed demo, idempotent: dilewati bila review sudah ada
npm run dev            # http://localhost:5173
```

## Verifikasi

Perintah resmi dari `package.json`. Ketiganya harus hijau sebelum kode dianggap selesai.

```bash
npm run check          # tsc --noEmit
npm run test           # vitest run (unit + contract, termasuk resolver store dan summary analytics)
npm run build          # vite build + bundle server + salin store.json ke dist
```

## Variabel lingkungan

| Variabel | Default | Kegunaan |
|----------|---------|----------|
| `DATABASE_URL` | tanpa | Connection string MySQL, wajib diisi |
| `PORT` / `PORT_FULL_V2` | `3000` / `9313` | Port host untuk v1 dan v2 |
| `JWT_SECRET` / `JWT_SECRET_V2` | tanpa | Kunci tanda tangan sesi, wajib di produksi |
| `ADMIN_USERNAME(_V2)` | `admin` | Username login lokal |
| `ADMIN_PASSWORD(_V2)` | `admin` | Password admin, wajib diganti di produksi |
| `SUPERADMIN_PASSWORD(_V2)` | `super123` | Password super admin, wajib diganti di produksi |
| `TZ` | `Asia/Jakarta` | Zona waktu timestamp |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` | kosong | Konfigurasi OAuth; dikosongkan berarti login lokal |
| `BUILT_IN_FORGE_API_URL/_KEY` | kosong | Generator aset, opsional |

Catatan: container `db-v2` tidak mengekspos port ke host. Akses langsung lewat `docker exec serso-review-monitor-db-v2-1 mysql ...`.

## Skema data

```
branches  1--*  teams           tim instalasi per pool
branches  1--*  qr_codes        kode QR aktif per branch
branches  1--*  reviews         review pelanggan, receiptNo menunjuk kode store
reviews   1--*  review_alerts   terbit otomatis saat rating di bawah ambang
reviews   1--*  audit_logs      jejak perubahan status dan suntingan
users      ->   akun admin dengan scope branchId
settings  ->   ambang negatif, teks halaman, zona waktu
```

Status review memakai enum `new`, `open`, `resolved`, `archived`. Alur normal bergerak satu arah: new menjadi open, open menjadi resolved. Archive khusus super admin dan final.

Kolom `readAt` pada `reviews` dan `review_alerts` hanyalah penanda notifikasi sudah dibuka, bukan status kerja.

## Deploy produksi

```bash
git fetch fork && git checkout fix/deploy-runtime
docker compose build app-full-v2
docker compose up -d db-v2 app-full-v2
```

Entrypoint container menjalankan `pnpm exec drizzle-kit migrate && node dist/index.js`, sehingga migrasi apply sendiri saat start.

```bash
curl -s http://127.0.0.1:9313/healthz    # "ok"
```

Setelah deploy, bersihkan cache Cloudflare memakai `cf-purge-kems.py`. Verifikasi terakhir selalu membandingkan bundle yang di-serve domain dengan bundle di dalam container; keduanya harus identik.

## Struktur proyek

```
client/src/pages/AdminApp.tsx       seluruh admin SPA dalam satu file
client/src/pages/PublicReview.tsx   formulir publik /r/:code
client/src/contexts/ThemeContext.tsx konteks dark/light
server/routers.ts                   router tRPC: auth, public, admin
server/db.ts                        akses data dan scoping role
server/store.ts + store.json        katalog store dan resolver tiket
server/analytics.ts                 Summary Review deterministik
server/seed.ts                      seed demo (target 120 review)
server/v2/server.ts                 server v2 tipis
shared/                             tipe dan konstanta
drizzle/                            schema.ts + migrasi 0000 sampai 0009
```

## Konvensi dan larangan

- Kredensial hanya lewat env, tanpa hardcode.
- `drizzle/schema.ts` adalah sumber kebenaran skema. Setiap perubahan kolom wajib menghasilkan file migrasi yang ikut di-commit sebelum deploy.
- `npm run db:push` dijalankan terhadap DB yang aktif. Pastikan `DATABASE_URL` menunjuk instance yang benar; untuk produksi v2 lewat `db-v2`.
- Semua kueri tunduk pada aturan role. Jangan menguji scope hanya dari UI; panggil endpoint terautentikasi sebagai bukti.
- Cek, test, dan build lewat dulu, baru commit dan deploy. Klaim "sudah terpasang" mensyaratkan verifikasi bundle live.
- Komponen UI baru wajib menyertakan varian `dark:` agar mode gelap tetap konsisten.
