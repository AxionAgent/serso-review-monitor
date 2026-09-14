# Serso Experience OS — Customer Review Monitoring

Aplikasi monitoring review pelanggan multi-store untuk instalasi layanan (pool/branch). Pelanggan scan QR → isi form review (1–5 ⭐, 3 dimensi + komentar) → admin pantau, tandai, dan resolve lewat dashboard.

Status proyek: **satu server production VPS Oracle ARM64**. Dua instance jalan berdampingan dari repo yang sama:

| Instance | Domain | Container | Port host | Database |
|----------|--------|-----------|-----------|----------|
| v1 | review.kemscloud.web.id | `serso-review-monitor-app-1` | `${PORT:-3000}` | `serso` |
| v2 (aktif dikembangkan) | reviewv2.kemscloud.web.id | `serso-review-monitor-app-full-v2-1` | `${PORT_FULL_V2:-9313}` | `serso_v2` |

Branch kerja aktif: **`fix/deploy-runtime`** (dipush ke fork `AxionAgent/serso-review-monitor`; PR #1 → `codex31/serso-review-monitor@main`). Branch `v2` lokal identik dengan `fix/deploy-runtime`.

## Stack

- Frontend: React + Vite + wouter + Tailwind CSS v4 + shadcn/ui + lucide-react + TanStack React Query
- Backend: Express + tRPC v11 (single router), sesi via cookie `kt_sess` (JWT)
- Database: MySQL 8 (drizzle-orm + mysql2); 10 file migrasi di `drizzle/`
- Auth: OAuth (Replit provider, opsional) **atau** login lokal admin/superadmin via env
- Deploy: Docker Compose (satu `Dockerfile` multi-stage) + Caddy reverse proxy + Cloudflare

## Arsitektur

```
Client (React SPA, dark/light) -> Express -> tRPC router (server/routers.ts)
                                             v
                           server/db.ts: akses MySQL + role scoping
                                             v
                  MySQL (serso / serso_v2) -- tabel inti:
                  users, branches, teams, qr_codes, reviews, review_alerts, audit_logs, settings
```

- `server/store.ts` — katalog 742 store (`server/store.json`). Kode store di-parse dari `receiptNo` (mis. `MB.5A.20260910.106` → store `5A` = HCIR SELMA SINGKAWANG G M). Kode tak dikenal → label **"Unknown"**.
- `server/analytics.ts` — "Summary Review": render deterministik sisi server (LLM sudah dibuang), window 7 hari, exclude branch berkode TEST.
- `server/v2/server.ts` — server v2 minimalis (`/healthz` saja, tanpa instrumentasi metrics).

## Fitur

### Publik (form review)
- Satu QR all-in-one mengarah ke `/r/:code` → form rating: 3 dimensi (pemasangan, grooming, pelayanan) + komentar + nomor struk.
- Submission publik memvalidasi QR aktif, menolak status invalid, auto-create alert bila rating overall di bawah threshold.

### Autentikasi & role admin
- Login lokal username/password: `ADMIN_USERNAME/ADMIN_PASSWORD` (admin) dan `SUPERADMIN_PASSWORD` (super admin) via env. Input password bertipe `password`, placeholder kosong.
- Sesi: cookie `app_session_id` (JWT, HttpOnly, 1 tahun), logout, role superadmin/branch admin dengan **scope branch** (branch admin hanya lihat data pool-nya).

### Dashboard Overview
- KPI: total review, rata-rata rating, hari ini, bulan ini, positif/negatif (vs threshold), open.
- Grafik: distribusi rating, tren harian, skor per dimensi.
- Analitik per branch, per team, dan **per store** (dari kode receipt, bukan per pool).
- **Alert Center**: daftar alert terbaru + ringkasan critical/attention/resolved. Menampilkan **nama store** (storeName) — fallback branchName.

### Reviews
- Tabel dengan search (debounce 300 ms, anti refetch-per-huruf demi keyboard Android), filter status, **dropdown filter store** (tidak boleh kosong), paginasi + ukuran halaman, sorting kolom (tanggal/store/rating/status), multi-select.
- Export: XLSX / ODS / CSV.
- Detail review: 3 sub-rating + overall, isi komentar, tombol status **Open / Resolved** (satu arah; "New" tampil sebagai badge kecil di samping Open + unread dot), **Arsip** hanya super admin (setelah diarsipkan tidak bisa kembali), tombol **Hapus** hanya super admin.
- Catatan resolve persist saat Open↔Resolved bolak-balik + bisa diedit.
- **History modal** (ikon History): log perubahan; super admin dapat mengedit/menghapus entri log.
- Menandai terbaca otomatis (`readAt`) saat admin membuka detail → unread dot hilang.
- Baris detail lama tidak lagi menampilkan "Tim Instalasi" dan "Sumber QR".

### Alerts
- Alert otomatis untuk review di bawah threshold (default 3.5, dikonfigurasi di Settings), severity `critical`/`attention`.
- Halaman Alerts: paginasi + search (receipt, pesan alert, komentar, store).
- Resolve alert dengan catatan; resolve sekaligus menandai terbaca.

### Notifikasi (header)
- Bell dengan badge jumlah belum dibaca (cap "9+"), isi gabungan review baru + alert baru.
- Tombol **"Tandai semua dibaca"** — set `readAt` massal (review + alert), tanpa mengubah status.
- Klik notifikasi → lompat ke detail review terkait.

### Analytics
- Tab "Summary Review": rekap 7 hari (exclude branch TEST) yang dirender otomatis di server — rata-rata 2 desimal, tertinggi/terendah per store, komentar per store.

### QR Codes
- Buat / aktif-nonaktifkan / hapus QR per branch, salin link `/r/:code`, preview gambar QR.

### Settings
- Konfigurasi: Company name, Review page title, Thank-you message, **Negative threshold** (default 3.5 — pemicu alert + garis positif/negatif), Timezone.
- **Danger zone**: hapus semua review ter-archive (permanen, konfirmasi di dialog).
- Branch, team, dan akun admin **tidak** dikelola dari UI — lewat seed / DB langsung.

### UI
- **Dark / light mode**: toggle ikon matahari/bulan di header (kiri bell), preferensi tersimpan di localStorage, seluruh panel admin punya varian `dark:`.
- Versi aplikasi **semver dari commit history** (`1.<jumlah feat>.<jumlah fix>`, dihitung saat build oleh `vite.config.ts`) tampil di sidebar kiri bawah logo.
- Semua dropdown auto-close saat klik di luar area.

### API (tRPC v2)
Rangkum endpoint utama: `auth.login/logout/me`, `public.submit`, `admin.overview`, `admin.reviews/review/search`, `admin.notifications`, `admin.markAllNotificationsRead`, `admin.latestReviewAt`, `admin.updateReviewStatus`, `admin.updateReviewNote`, `admin.markReviewRead`, `admin.reviewHistory`, `admin.editReviewHistory` (superadmin), `admin.deleteReviewHistory` (superadmin), `admin.assignReview`, `admin.deleteReview/deleteAllReviews/deleteArchivedReviews` (superadmin), `admin.analyticsRecap`, `admin.alerts/resolveAlert`, `admin.qrCodes/createQRCode/toggleQRCode/deleteQRCode`, `admin.exportReviews`, `admin.settings/updateSettings`.

## Menjalankan lokal

```bash
npm install
cp .env.example .env   # isi DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, SUPERADMIN_PASSWORD
npm run db:push        # = drizzle-kit generate && drizzle-kit migrate
npx tsx server/seed.ts # seed demo (idempotent: skip kalau review sudah >= 120)
npm run dev            # http://localhost:5173
```

## Testing & verifikasi

```bash
npm run check          # tsc --noEmit — harus 0 error sebelum deploy
npm run test           # vitest run (23 test: store resolution, analytics summary, dsb)
npm run build          # vite build + esbuild server + server v2 + salin store.json ke dist
```

## Environment variables

| Variabel | Default | Kegunaan |
|----------|---------|----------|
| `DATABASE_URL` | — | MySQL connection string (WAJIB) |
| `PORT` / `PORT_FULL_V2` | `3000` / `9313` | Port instance v1 / v2 (host) |
| `JWT_SECRET` / `JWT_SECRET_V2` | — | Kunci sesi (WAJIB produksi) |
| `ADMIN_USERNAME(_V2)` | `admin` | Username login lokal |
| `ADMIN_PASSWORD(_V2)` | `admin` | Password admin — ganti di produksi |
| `SUPERADMIN_PASSWORD(_V2)` | `super123` | Password super admin — ganti di produksi |
| `TZ` | `Asia/Jakarta` | Timestamp lokal |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` | kosong | OAuth Replit (kosongkan = login lokal) |
| `BUILT_IN_FORGE_API_URL/_KEY` | kosong | Asset forge generator (opsional) |

Catatan compose: DB `db-v2` tidak mengekspos port ke host (internal docker network saja); akses langsung lewat `docker exec serso-review-monitor-db-v2-1 mysql ...`.

## Database

```
branches  1--*  teams    (tim instalasi per pool)
branches  1--*  qr_codes (kode QR aktif per branch)
branches  1--*  reviews  (review pelanggan; receiptNo -> kode store via store.json)
reviews   1--*  review_alerts  (auto saat rating < threshold; status open/resolved + readAt)
reviews   1--*  audit_logs     (log status/edit review; superadmin bisa edit/hapus entri)
users:        akun admin (superadmin/branch admin, scope branchId)
settings:     threshold rating negatif + preferensi dashboard
```

Enum status review: `new` (baru masuk, tak muncul sebagai tombol — jadi badge), `open`, `resolved`, `archived`. Alur normal: new → open → resolved (one-way; archived khusus superadmin dan final).

`reviews.readAt` & `review_alerts.readAt` = penanda notifikasi terbaca (bukan status kerja).

## Deploy production (VPS)

```bash
git fetch fork && git checkout fix/deploy-runtime
docker compose build app-full-v2
docker compose up -d db-v2 app-full-v2
# entrypoint container: `pnpm exec drizzle-kit migrate && node dist/index.js`
# -> migrasi jalan otomatis saat container start
curl -s http://127.0.0.1:9313/healthz   # "ok"
```

Domain reviewv2.kemscloud.web.id → Caddy reverse proxy → :9313. Setelah deploy: purge cache Cloudflare (`cf-purge-kems.py`).

## Konvensi & larangan

- Jangan pernah hardcode password; kredensial via env.
- `drizzle/schema.ts` adalah sumber kebenaran skema — setiap perubahan kolom wajib `npm run db:generate` + commit SQL migrasinya, baru deploy.
- Jangan jalankan `npm run db:drop` di production.
- Semua query ter-scope role — branch admin tidak boleh bisa melihat data pool lain; cek pakai endpoint terautentikasi, bukan cuma UI.
- `pnpm run check` + `pnpm run test` + `pnpm run build` harus hijau sebelum commit/deploy; verifikasi bundle live = bundle container sebelum klaim "sudah ter-deploy".
- Styling dark mode: komponen baru wajib punya varian `dark:` (atau jalankan pass konversi), jangan pakai warna light-only mentah.

## Development

Struktur penting:

```
client/src/pages/AdminApp.tsx      # SELURUH admin SPA (single-file, sadar trade-off)
client/src/pages/PublicReview.tsx  # form publik /r/:code
client/src/pages/Home.tsx          # landing
client/src/contexts/ThemeContext.tsx
server/routers.ts                  # tRPC router (auth, public, admin)
server/db.ts                       # semua akses DB + scoping role
server/store.ts / store.json       # katalog 742 store + resolver receipt->store
server/analytics.ts                # Summary Review deterministik
server/seed.ts                     # seed demo (idempotent, target 120 review)
server/v2/server.ts                # server v2 minimal
shared/                            # tipe + konstanta (const.ts)
drizzle/schema.ts + 0000..0009     # skema + migrasi
```

- `npm run dev` — dev server (tsx watch)
- `npm run db:push` — generate migrasi + migrate dari `drizzle/schema.ts`
- `npm run check` / `npm run test` / `npm run build` — lihat bagian Testing
- `npm run format` — prettier
- `npm run shadcdn add <component>` — tambah komponen shadcn/ui
