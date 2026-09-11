# Customer Review & Service Quality Management

Live deployment: **https://reviewv2.kemscloud.web.id** (this is the primary instance; the older
`review.kemscloud.web.id` runs the same code against a separate database).

## Product overview

The application replaces the spreadsheet workflow:

> Customer → Scan QR → Review Form → Backend → Database → Admin Workspace → Analytics

There is one all-in-one QR (`/r/UNIVERSAL`) whose `branchId` is `NULL`. The customer never picks
a branch: the review is stored unassigned and an admin assigns the store afterwards (the store
column is inline-editable). Per-branch QR codes (`/r/SGK`, `/r/PTK`, `/r/KTP`) are still
supported — the browser never submits a trusted `branchId`; the server resolves the QR code to
its branch. Disabled QR codes and inactive branches are rejected before submission. Unrecognized
receipt numbers display as `Unknown` in the store column.

## Technology

- React 19 + TypeScript + Vite
- Tailwind CSS 4 with a custom teal / leaf visual system, glassmorphism panels
- Express + tRPC 11 for typed server procedures
- Drizzle ORM + MySQL 8.4 (Docker volume; TiDB-compatible migrations retained from the original
  WebDev scaffold)
- Signed local session cookie (`app_session_id`, 1-year maxAge) for authenticated workspace access
- Recharts for analytics
- `qrcode.react` for real SVG QR codes
- `xlsx` for the export button — **dynamically imported** so it stays out of the initial chunk
- Vitest suite: `pnpm test` (26 tests in `server/analytics.test.ts`, `auth.logout.test.ts`,
  `status-visibility.test.ts`, `store.test.ts`)

Authentication uses a signed local session cookie. OAuth registration is disabled for this
deployment.

## Deployment topology (docker compose)

| Service | Host port | DB | Public URL |
| --- | --- | --- | --- |
| `app` | 9311 | `serso` (db) | review.kemscloud.web.id |
| `app-full-v2` | 9313 | `serso_v2` (db-v2) | reviewv2.kemscloud.web.id |

Both app services run the **same** image (`Dockerfile` → `node dist/index.js`, the full React
app). Caddy terminates TLS and reverse-proxies each subdomain to its port; Cloudflare sits in
front of Caddy. Env vars come from `.env` (`MYSQL_*` for v1, `MYSQL_*_V2` / `JWT_SECRET_V2` /
`ADMIN_PASSWORD_V2` / `PORT_FULL_V2=9313` for reviewv2).

> ⚠️ `server/v2/server.ts` (+ `server/v2/public/*.html`) is a legacy standalone vanilla-admin
> experiment. It is **dead code** — the Dockerfile builds `dist/v2/server.js` but no running
> service uses it. All live admin traffic goes to the React `AdminApp.tsx` via `serveStatic`.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Branded entry page with links to the workspace and demo QR routes |
| `/r/UNIVERSAL` | Public review form — one all-in-one QR, no branch selector |
| `/r/SGK` `/r/PTK` `/r/KTP` | Branch-bound review forms (legacy style, still resolved server-side) |
| `/admin` | Login gate, then live KPI overview, trend chart, rating distribution, recent reviews, alerts |
| `/admin/reviews` | Searchable review table, status workflow, store/team inline edit, XLSX/ODS/CSV export, delete |
| `/admin/alerts` | Negative-review alert queue and resolve action |
| `/admin/qr-codes` | QR generation, SVG download, preview, activation, and disable flow |
| `/admin/analytics` | Branch, team, QR, and dimension analytics + AI Summarize |
| `/admin/settings` | Persisted customer-facing settings, branches (create/activate/deactivate), negative threshold |

There is no `/admin/teams` page — teams are only listed on a review (the `teams` table is used by
`getBranchActiveTeams`, not managed from the UI).

## Database model

The schema lives in `drizzle/schema.ts`. Tables: `users`, `branches`, `teams`, `qr_codes`,
`reviews`, `review_alerts`, `audit_logs`, `settings`. Key shapes:

- `users` — `openId` unique, `email`, `role` enum (`user`/`admin`/`super_admin`/`branch_admin`/
  `viewer`), `branchId` scope, `status`
- `branches` — unique `code`, `status` enum `active`/`inactive`. Live rows in `serso_v2`:
  `POOLSKW` (POOL SINGKAWANG), `TEST` (TEST POOL), `PNK` (PONTIANAK)
- `qr_codes` — unique `code`, `url`, `status`; `branchId NULL` = universal QR. Live:
  `REVIEW` → `/r/UNIVERSAL`
- `reviews` — `branchId` nullable (universal QR reviews start unassigned), `receiptNo`, three
  ratings, `comment`, `status` enum, `note` text (captured on resolve)
- `review_alerts` — auto-created when any rating ≤ configured negative threshold
- `settings` — company name, customer page copy, negative threshold, timezone, branding

Indexes cover branch, QR, receipt, created timestamp, status, ratings, alert state, and audit lookups.

## Review lifecycle status

`reviews.status` is a MySQL enum with exactly four values: `new`, `open`, `resolved`, `archived`.
There is no `reviewed` value — it was a ghost from an early schema revision and was removed
(migration `drizzle/0007_mixed_zuras.sql`). Do not reintroduce it.

Allowed transitions (enforced in `server/db.ts::updateReviewStatus`, verified empirically):

| Role | From | To | Result |
| --- | --- | --- | --- |
| admin | `new` | `open`, `resolved` | allowed |
| admin | `new` | `archived` | blocked — super admin only |
| admin | `open` | `resolved` | allowed |
| admin | `open` | `new` | blocked — admin cannot return to New |
| admin | `resolved` | `open`, `resolved` | allowed (reopen) |
| admin | `archived` | anything | invisible — `Review not found` |
| super_admin | `new` | `open`, `resolved`, `archived` | allowed |
| super_admin | `open` | `new`, `resolved`, `archived` | allowed |
| super_admin | `resolved` | `open`, `resolved`, `archived` | allowed (reopen) |
| super_admin | `archived` | `open`, `resolved`, `archived` | allowed (unarchive) |
| any | `resolved`, `archived` | `new` | blocked for every role, including super_admin |

The one hard invariant for everyone: a review that reached `resolved` or `archived` can never
return to `new`. Everything else above is role-gated. Note super_admin *can* roll `open → new` —
the only path back to New that exists.

Only `admin` and `superadmin` can log in (`auth.login` checks `ADMIN_PASSWORD` /
`SUPERADMIN_PASSWORD`; there is no viewer or branch_admin login path). The `viewer` and
`branch_admin` roles exist in the schema and seed, and every write route calls
`assertWritable()` which rejects `viewer` — but those roles are currently unreachable from the
UI, so their behaviour is code-level only.

Archived reviews are excluded from `admin.reviews`, `admin.alerts`, `admin.review` (direct
`?id=` lookups return `null`), analytics, and KPI counts for every role except `super_admin`.
The rule lives in one place: `server/db.ts::hiddenStatusesFor` — change it there, not in the UI.

Moving a review to `resolved` captures an optional action note (`reviews.note`). Both the
review detail modal and the alerts resolve dialog write it. An alert resolve never mutates a
review that is already outside the `new`/`open` flow, so archived reviews cannot be silently
reopened.

## Analytics Summary

`admin.analyticsRecap` is a plain query that returns a **deterministic, server-rendered**
digest built from the last **7 days** of reviews via `db.ts::getAllNonArchivedReviews(user, 7)`. Excluded: `archived`
reviews, `inactive` branches, and the branch codes listed in
`ANALYTICS_EXCLUDED_BRANCH_CODES` (currently `TEST`, because TEST POOL exists as a real
`active` branch). Reviews with no branch (universal QR) are kept.

All maths and the final text live in `server/analytics.ts` (`summarizeStats` /
`renderSummary`), unit-tested in `analytics.test.ts`. The Analytics page loads it automatically —
no button press needed, and it cannot fabricate a number.

Layout (owner-approved): header block (period, totals, per-aspect averages, pending/resolved
counts), then one block per store sorted by lowest average — each naming the *lowest-rated
review that is not yet resolved* (receipt number, per-aspect scores, date, status label, and
its comment when present) — then a closing note on the weakest aspect (ties are reported as
ties, never guessed). "Lowest" ignores resolved reviews by design — resolved means no longer
a problem.

> History: v1 sent raw rows to an LLM (9router) — it fabricated counts (claimed 88 reviews,
> 53 bad, from 78 rows / 19 bad). v2 computed stats server-side but still let the LLM phrase
> the output — layout came out as an unreadable run-on wall. v3 (current): the model was cut
> out of the loop entirely; `renderSummary` produces the text itself.

## Installation and local development

```bash
pnpm install
# no .env.example in repo — create .env (gitignored) with MYSQL_* + *_V2 keys,
# see docker-compose.yml for the variable names
pnpm db:push           # drizzle-kit generate && migrate
pnpm check && pnpm test
pnpm dev
```

Required runtime variables: `DATABASE_URL` (mysql://…), `JWT_SECRET`, `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, `SUPERADMIN_PASSWORD`. Do not commit secrets or local `.env` files.

The first migration was adjusted for TiDB compatibility so `settings.thankYouMessage` uses a
bounded `varchar(500)` instead of a text default.

## Seed data

The idempotent seed script is `server/seed.ts` (`pnpm exec tsx server/seed.ts`). It targets
`SEED_REVIEW_COUNT = 120` reviews, top-up only — if the table already has ≥120 rows it prints
`Seed skipped` and does nothing. It creates:

- Singkawang, Pontianak, and Ketapang branches **only if the branch table is empty** (real
  deployments keep their own branches; live v2 rows are POOLSKW/TEST/PNK)
- The universal QR (`/r/UNIVERSAL`, `branchId NULL`) if absent; per-branch QRs when present
- Reviews distributed over the previous 90 days with varied ratings, statuses, comments, and QR
  sources (the current UI does not expose team assignment; the seed predates that change)
- Low-rating alerts generated from seeded reviews
- Role fixture users (`admin@example.com`, `singkawang@example.com`, `viewer@example.com`)

The dashboard uses live database aggregation; KPI values are never hardcoded.

## Demo accounts and authentication

| Role | Username | Development password |
| --- | --- | --- |
| Admin | `admin` | `admin` (env `ADMIN_PASSWORD`; compose default `admin`) |
| Super admin | `superadmin` | `super123` (env `SUPERADMIN_PASSWORD`; code fallback `super1234`) |

The server validates these credentials, creates or reuses the seeded role, and issues the signed
`app_session_id` cookie (1-year maxAge). Replace the hardcoded development credential check with
a secret-backed credential or an enterprise identity provider before wider production use.

## QR generation

From **QR Codes**, choose a branch and name. The server creates a unique code and stores a
destination such as `/r/1-ABC123`. The UI renders the live absolute URL as an SVG QR code. Each
QR card supports: view the customer route, download the QR as SVG, disable or reactivate the QR,
and displays branch, QR name, code, and destination URL. The operational model is one universal
QR for all stores — branch-bound demo routes remain supported for legacy printed codes.

## Review behavior and validation

Public submissions enforce server-side validation for receipt number (required, ≤80 chars),
ratings (integer 1–5), comment length (≤1000), QR existence and status, branch status, and a
**15-second per-IP-per-QR rate limiter** (`TOO_MANY_REQUESTS`, in-memory map). Duplicate receipt
numbers for the same branch return a friendly duplicate message; no data is silently deleted.
Any rating at or below the configured negative threshold auto-creates an open critical alert.

The admin procedures enforce authentication and scope on the backend. A `branch_admin` can only
query and mutate records belonging to the assigned branch. A `viewer` can query but cannot write.
`admin` / `super_admin` can access the complete workspace. Admin actions write audit events.

## Build and production deployment

```bash
pnpm check
pnpm build   # vite client -> dist/public (+ esbuild server dist/index.js; dist/v2 is legacy)
docker compose up -d --build app-full-v2   # deploy reviewv2
```

Static asset caching (root cause of the old "blank first paint until refresh"): hashed files
under `/assets` are content-addressed by Vite, so `server/_core/vite.ts::serveStatic` serves them
with `Cache-Control: public, max-age=31536000, immutable`. The HTML shell and the SPA fallback
are served `no-store` so a new deploy's hashed reference is picked up immediately. Before this,
`express.static` sent `max-age=0`, Cloudflare returned `REVALIDATED` on every visit, and each
visitor re-pulled the ~900KB entry chunk from the slow OCI origin (3.5–8s of blank page). After
any deploy that changes hashed asset names, purge the old file URLs in Cloudflare.

Production hardening should include replacing the development credential check with a
secret-backed value, validating rate limits against expected traffic, and enabling database
backups (`mysql_data` / `mysql_v2_data` volumes).

## Architecture overview

- `client/src/pages/PublicReview.tsx` owns the mobile customer journey.
- `client/src/pages/AdminApp.tsx` owns the workspace layout and all feature pages (login gate,
  overview, reviews, alerts, QR codes, analytics, settings) — one file, tab-routed by URL.
- `client/src/App.tsx` wires public (`/r/:code`), admin (`/admin`), and 404 routes.
- `server/routers.ts` defines public and protected tRPC contracts, validation, access checks,
  login/logout, and mutation orchestration.
- `server/db.ts` contains database queries, scope filtering, review creation, status-transition
  enforcement, alert generation, analytics aggregation, CSV export, and audit logging.
- `server/analytics.ts` — AI-summarize prompt assembly + server-side stats.
- `shared/store.ts` — receipt-number → store mapping for unassigned reviews.
- `drizzle/schema.ts` is the source of truth for relational tables and indexes.
- `server/v2/*` — legacy dead vanilla-admin, not served by any running container.

## Acceptance flow

1. Open `/r/UNIVERSAL`; the form shows no branch selector. Submit a unique receipt with ratings;
   the review is stored with `branchId NULL` and appears with calculated overall rating.
2. In the reviews workspace, assign the store inline; it now counts under that branch.
3. Submit a rating at or below the negative threshold; an open negative-review alert is created.
4. Move a review to `resolved` with a note; the alert resolve never reopens it.
5. Disable a QR from QR Codes; visiting its route shows `QR Code tidak aktif.` and no form.
6. As `admin`, try to archive or return a resolved review to New — both blocked; as `superadmin`,
   archive/unarchive works but `resolved → new` is blocked for everyone.
7. First visit to `/admin` renders within one asset download: `/assets/*` responses carry
   `immutable, max-age=1y`, the HTML shell carries `no-store`.
