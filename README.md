# Customer Review & Service Quality Management

A production-oriented internal web application for converting QR-scanned customer feedback into structured operational data. Customers scan a branch QR code, submit a mobile-first review without selecting a branch, and the backend associates the submission with the branch and QR source. Staff use the workspace to monitor ratings, resolve alerts, compare branches and teams, and export review data.

## Product overview

The application replaces the spreadsheet workflow:

> Customer → Scan Branch QR → Review Form → Backend → Database → Admin Workspace → Analytics

The server resolves the QR identifier to the active branch and QR record. The browser never submits a trusted `branchId`; the public mutation receives only the QR code and review fields, then looks up the branch server-side. Disabled QR codes and inactive branches are rejected before the form can be submitted.

## Technology

- React 19 + TypeScript + Vite
- Blue/white gradient surfaces with glassmorphism panels
- Tailwind CSS 4 with a custom teal / leaf visual system
- Express + tRPC 11 for typed server procedures
- Drizzle ORM + MySQL/TiDB
- Signed local session cookie for authenticated workspace access
- Recharts for analytics
- `qrcode.react` for real SVG QR codes
- Vitest-ready project structure

The managed project uses the WebDev `web-db-user` scaffold, with OAuth callback registration disabled for this deployment. Authentication uses a signed local session cookie and the development credential pair `admin:admin`; role fixtures are seeded in the database and the live authenticated user's role is enforced by backend procedures.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Branded entry page with links to the workspace and demo QR routes |
| `/r/SGK` | Public Singkawang review form |
| `/r/PTK` | Public Pontianak review form |
| `/r/KTP` | Public Ketapang review form |
| `/admin` | Live KPI overview, trend chart, rating distribution, recent reviews, and alert summary |
| `/admin/reviews` | Searchable review table, status workflow, and CSV export |
| `/admin/alerts` | Negative-review alert queue and resolve action |
| `/admin/branches` | Branch listing, create, activate/deactivate |
| `/admin/teams` | Installation team listing and create flow |
| `/admin/qr-codes` | QR generation, SVG download, preview, activation, and disable flow |
| `/admin/analytics` | Branch, team, QR, and dimension analytics |
| `/admin/settings` | Persisted customer-facing settings and negative threshold |

## Database model

The schema lives in `drizzle/schema.ts` and includes:

- `users` with role, branch scope, and status
- `branches` with unique branch code and active/inactive state
- `teams` scoped to a branch
- `qr_codes` with unique code, URL, status, and creator
- `reviews` with branch, QR, optional team, receipt, three ratings, comment, and lifecycle status
- `review_alerts` for automatically detected low ratings
- `audit_logs` for administrative actions
- `settings` for company name, customer page copy, negative threshold, timezone, and branding

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
return to `new` (line 438). Everything else above is role-gated. Note super_admin *can* roll
`open → new` — the only path back to New that exists.

Only `admin` and `super_admin` can log in (`auth.login` checks `ADMIN_PASSWORD` /
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

## AI Summarize

`admin.analyticsSummarize` builds a prompt from the last **7 days** of reviews via
`db.ts::getAllNonArchivedReviews(user, 7)`. Excluded: `archived` reviews, `inactive` branches,
and the branch codes listed in `ANALYTICS_EXCLUDED_BRANCH_CODES` (currently `TEST`, because
TEST POOL exists as a real `active` branch). Reviews with no branch (universal QR) are kept.

Prompt assembly and all aggregate maths live in `server/analytics.ts`
(`buildSummaryPrompt` / `summarizeStats`), unit-tested in `analytics.test.ts`. Stats are
computed server-side and injected into the prompt as fixed facts — the model is instructed not
to recount. This is deliberate: left to compute from raw rows, the model fabricated counts
(claimed 88 reviews and 53 bad when 78 rows were sent, 19 of them bad).

## Installation and local development

```bash
pnpm install
cp .env.example .env # if using a local environment file
pnpm drizzle-kit generate
pnpm check
pnpm dev
```

Required runtime variables are provided by the managed environment. The relevant variables include `DATABASE_URL`, `JWT_SECRET`, and the built-in API variables documented in `server/_core/env.ts`. Do not commit secrets or local `.env` files.

For a local database, apply the generated SQL using the project's normal Drizzle migration process. The managed environment already has the schema applied. The first migration was adjusted for TiDB compatibility so `settings.thankYouMessage` uses a bounded `varchar(500)` instead of a text default.

## Seed data

The idempotent seed script is `server/seed.ts`:

```bash
pnpm exec tsx server/seed.ts
```

It creates:

- Singkawang, Pontianak, and Ketapang branches
- Six installation teams across the branches
- Five working QR codes, including `/r/SGK`, `/r/PTK`, and `/r/KTP`
- 120 reviews distributed over the previous 90 days
- Different ratings, statuses, comments, teams, and QR sources
- Low-rating alerts generated from seeded reviews
- Three role fixtures in `users`

The dashboard uses live database aggregation from these rows; KPI values are not hardcoded.

## Demo accounts and authentication

The seed script creates role fixtures with these development identifiers:

| Role | Email fixture |
| --- | --- |
| Super admin / admin | `admin@example.com` |
| Singkawang branch admin | `singkawang@example.com` |
| Viewer | `viewer@example.com` |

OAuth is disabled in this deployment. Use the local admin form with `admin:admin` for workspace administration or `superadmin:super123` for destructive super-admin operations. The server validates these credentials, creates or reuses the seeded admin role, and issues the signed `app_session_id` cookie. Replace the hardcoded development credential check with a secret-backed credential or an enterprise identity provider before production use.

## QR generation

From **QR Codes**, choose a branch and name. The server creates a unique code and stores a destination such as `/r/1-ABC123`. The UI renders the live absolute URL as an SVG QR code. Each QR card supports:

- View the customer route
- Download the QR as SVG
- Disable or reactivate the QR
- Display branch, QR name, code, and destination URL

The three seeded demo routes are intentionally human-friendly for demonstration; newly generated codes use a unique branch-prefixed identifier.

## Review behavior and validation

Public submissions enforce server-side validation for receipt number, ratings, comment length, QR existence, QR status, branch status, and a lightweight IP/QR rate limiter. Submissions with a duplicate receipt for the same branch receive a friendly duplicate message instead of silently deleting data. If any rating is at or below the configured negative threshold, the server creates an open critical alert.

The admin procedures enforce authentication and scope on the backend. A `branch_admin` can only query and mutate records belonging to the assigned branch. A `viewer` can query but cannot write. `admin` / `super_admin` can access the complete workspace. Admin actions write audit events.

## Build and production deployment

```bash
pnpm check
pnpm build
pnpm start
```

The managed WebDev deployment builds the Vite client and bundles the Express/tRPC server into `dist`. Use a checkpoint before publishing. Production hardening should include replacing the development credential check with a secret-backed value, configuring the production domain, validating rate limits against expected traffic, and enabling backups for the database.

## Architecture overview

- `client/src/pages/PublicReview.tsx` owns the mobile customer journey.
- `client/src/pages/AdminApp.tsx` owns the workspace layout and feature pages.
- `client/src/App.tsx` wires public, QR, and admin routes.
- `server/routers.ts` defines public and protected tRPC contracts, validation, access checks, and mutation orchestration.
- `server/db.ts` contains database queries, scope filtering, review creation, alert generation, analytics aggregation, CSV export, and audit logging.
- `drizzle/schema.ts` is the source of truth for relational tables and indexes.
- `server/seed.ts` creates realistic demonstration rows without hardcoding dashboard values.

## Acceptance flow

1. Open `/r/SGK`; the form shows `Branch: Singkawang` and does not expose a branch selector.
2. Submit a unique receipt with ratings; the backend stores branch and QR IDs automatically.
3. Open the reviews workspace; the review appears with calculated overall rating.
4. Submit a rating of 1; an open negative-review alert is created.
5. Disable a QR from QR Codes; visiting its route shows `QR Code tidak aktif.` and no form.
6. Open `/r/PTK`; the route resolves to Pontianak rather than Singkawang.
7. Use the branch-scoped role in an authenticated session; server-side scope checks prevent access to another branch.
