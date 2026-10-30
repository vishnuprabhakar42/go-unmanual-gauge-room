@AGENTS.md

# Go Unmanual · Gauge Room — engineering guide

B2B SaaS that runs the gauge room of Indian manufacturing plants: instrument master → due planning → calibration
requests → POs against rate contracts / RFQs → returnable delivery challan (CGST Rule 55) → return → certificate
verification (NABL scope) → OOT handling → IATF 16949 / ISO 9001 (cl. 7.1.5) audit pack. Calibration labs use a free
vendor portal. Build milestone by milestone (M0–M7); assumptions go in `docs/DECISIONS.md`.
Branded **Go Unmanual** (company) / **Gauge Room** (product): use `BRAND` from `src/brand.ts` and `app.*` messages, never
hard-coded names; brand colours are `--brand-*` tokens (Tailwind `brand-navy|blue|sky|violet`).

## Stack

- Next.js 16 (App Router, **Turbopack**, `proxy.ts` instead of middleware, `cacheComponents` OFF), TypeScript strict
- PostgreSQL 16+ via Prisma 7 (`prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg`, `prisma.config.ts`)
- Auth.js v5 (`next-auth@beta`): credentials + email magic link, JWT sessions, Prisma adapter
- Tailwind 4 + shadcn/ui (radix, "nova"), TanStack Table **v9** (`useTable`, `tableFeatures`), react-hook-form + zod 4
- pg-boss 12 (jobs/schedules; worker = separate process), Nodemailer behind `EmailProvider`, WhatsApp provider interface
- next-intl (English only; every UI string in `messages/en.json`)
- S3/MinIO (or local) storage, @react-pdf/renderer + pdf-lib (audit pack), exceljs, qrcode, Anthropic API (feature-flagged, `AI_MODEL` env)
- Vitest (unit + integration projects), Playwright (e2e on a separate seeded DB)

## Commands

```
pnpm db:start          # Docker-free Postgres on :5432 (embedded-postgres; data in .pgdata/)  — or: docker compose up -d
pnpm db:migrate        # prisma migrate dev (then `pnpm db:generate` — Prisma 7 does not auto-generate)
pnpm db:reset          # drop, migrate, seed
pnpm db:seed
pnpm dev               # web app on :3000
pnpm worker            # pg-boss worker (notifications, schedules)
pnpm run ci            # lint + typecheck + unit + integration tests  (NB: `pnpm ci` is a pnpm builtin)
pnpm test:unit | test:integration | test:e2e
pnpm tsx scripts/fixtures/messy-register.ts 2000 out.xlsx   # messy sample register for import demos/tests
```

Integration tests use `TEST_DATABASE_URL` (gauge_room_test); e2e uses `E2E_DATABASE_URL` (gauge_room_e2e), reset+seeded
by `e2e/global-setup.ts`; Playwright builds and starts a production server on :3100 plus the worker (`e2e/worker.ts`) (`NEXT_DIST_DIR=.next-e2e`) — dev-mode compiles race hydration on slow machines.

## Layout

```
src/domain/        pure business rules (no I/O): rbac, numbering, india/{gstin,pan,format,states}, settings, schemas,
                   instrument-status + calibration-request-status (state machines), due (due engine, per-type windows,
                   months, aging), digest (recipients/escalation), import/ (dates, values, fields, mapping, validate)
                   vendor-selection, scope-match, gst (CGST/SGST/IGST, amount in words), purchase-status, quote-compare,
                   challan (Rule 55 rules), calibration-job-status (state machine), certificate-match, lab-progress,
                   readings (pass/fail maths, paste, tolerance parsing), verification-checklist, oot (state machine,
                   dispositions), cert-extraction (AI output → form prefill), audit-pack (status machine, period,
                   page layout/index), reports (vendor performance, spend)
src/server/        server-only: db, tenant/ (scoped client), action.ts, context.ts, services/, notify/, jobs/, storage/, ai/,
                   vendor-portal/ (scope.ts = lab isolation; every portal read uses vendorScope, writes withVendorTx)
src/worker/        pg-boss worker entry + handlers
src/app/           routes: (auth)/ login+register, setup/, (app)/ authenticated shell, vendor/ lab portal, api/
src/components/    ui/ (shadcn), shell/, data/ (DataTable, pagination, empty state), forms/
messages/en.json   all UI strings
prisma/            schema, migrations, seed.ts
tests/integration  DB-backed tests;  e2e/  Playwright
```

## Non-negotiable conventions

1. **Multi-tenancy.** App code never queries business tables with `prisma` from `@/server/db` (ESLint blocks it in
   `src/app`, `src/components`, `src/domain`). Use `tenantDb(ctx)` for reads and `withTenantTx(ctx, fn)` for writes.
   The extension AND-s `organizationId` (and `plantId IN accessible plants` for plant-scoped models) into every query,
   stamps `organizationId` on creates and refuses cross-tenant writes.
   - Every new model must be added to `src/server/tenant/models.ts` (a test fails otherwise): org-scoped / plant-scoped /
     audited / global.
   - Use scalar FKs (`organizationId`, `plantId`) in writes, not nested `connect`; avoid nested writes (they bypass
     scoping and audit). Nested `include`s of children are fine, but filter them by org explicitly when the relation can
     cross tenants (e.g. User → memberships).
   - `$queryRaw` bypasses the extension: always filter by `organizationId` yourself (see `number-series.ts`).
2. **Every mutation is an audited server action.** Write actions with `defineAction({ permission, input, plantId? }, handler)`
   from `src/server/action.ts`: session → zod → RBAC (`assertCan`) → `withTenantTx` → typed `ActionResult`. Audit rows
   (CREATE/UPDATE/ARCHIVE/RESTORE/STATUS_CHANGE with before/after JSON, actor, IP) are written automatically for models
   in `AUDITED_MODELS`, in the same transaction. AuditLog is append-only (DB trigger).
3. **No hard deletes** of business records — set `archivedAt`. The tenant client throws on delete.
4. **Status changes only through state machines** in `src/domain/*` (explicit transition maps + unit tests). Never set
   `status` directly from UI/API code.
5. **RBAC:** permissions in `src/domain/rbac.ts`. Pages call `requirePermission(perm)`; actions declare `permission`.
   Memberships are org-wide (`plantId = null`) or per plant.
6. **Errors:** throw `UserError(message, fieldErrors?)` for expected failures; anything else is logged and shown generically.
7. **Due logic:** always filter "due soon"/"overdue" via `instrumentWhere(filters, await loadDueConfig(db))`. It reads
   `Instrument.planningDate` (= next due − instrument/type/org lead days), which **DB triggers maintain — never write it**. **Jobs/notifications:** enqueue with `enqueue(name, data, { tx })` or `notify(tx, {...})` inside the transaction so
   jobs exist only if the write commits. Add queues to `src/server/jobs/queues.ts`, handlers to `src/worker/handlers.ts`,
   templates to `src/server/notify/templates.ts`. Schedules use `tz: "Asia/Kolkata"`.
8. **Inside transactions** never `Promise.all` queries (one connection) — use `sequential([...])` from `@/server/sequential`.
   **Document numbers:** `nextDocNumber(tx, { plantId, docType })` — per plant + financial year (Apr–Mar, IST), template
   tokens `{PREFIX}{PLANT}{FY}{FYC}{SEQ}`. Challans (DC) must be ≤ 16 chars (Rule 55); validated on config and issue.
9. **India defaults:** `Asia/Kolkata`; show dates via `formatDate` (DD-MM-YYYY) / `formatDateTime`; money via `formatINR`
   (₹1,25,000.00); validate GSTIN (regex + checksum) and PAN with `src/domain/india`; HSN/SAC are strings from config.
10. **Lists:** server-side pagination + URL-bound filters (`FilterSelect`, `SearchInput`), `SavedViews`, TanStack `DataTable`
    with `columnClassName` for responsive columns, Excel export via a route handler that reuses the page's param parser.
    **UI:** strings via next-intl; mobile-first, touch targets ≥ 44px (`h-11`); every list: server-side pagination +
    search (filters, saved views, bulk select, Excel export from M1); empty states say what to do next.
11. **Scale:** lists must stay fast at 20,000 instruments/org → paginate server-side, index filter columns.
12. **Types:** strict; no `any` in `src/domain` (lint error). Domain code is pure and unit-tested.

## Definition of done (per milestone)

Lint + typecheck clean · unit tests for business rules · ≥1 Playwright happy path on seeded data · every mutation audited
and every list org-scoped (tests) · seed updated so the feature is demoable · README + docs/DECISIONS.md updated · commit.

## Domain glossary

- **Instrument / Gauge** — any measuring device (vernier, micrometer, plug/ring gauge, pressure gauge, thermocouple,
  multimeter, torque wrench, weighing balance…). Use `Instrument` in code.
- **Instrument Type** — template (e.g. "Digital Vernier Caliper 0–150 mm") with default frequency, tolerance, NABL
  requirement, HSN code.
- **Calibration frequency** — interval in days/months; next due = last calibration date + interval.
- **Planning date** — next due − "plan N days before due" (instrument override by admin → type lead time → company default).
- **Calibration standard** — code + edition date on the type (inherited) or instrument (override); snapshotted on each job.
- **NABL** — India's accreditation body for ISO/IEC 17025 labs. A NABL certificate has a number (e.g. CC-1234), validity,
  and a scope (parameter, range, CMC / best measurement capability).
- **ULR number** — unique lab report number printed on NABL-accredited certificates.
- **Rate contract** — annual agreement with a vendor fixing a price per instrument type.
- **Release order / PO** — purchase order issued against a rate contract or a spot quote.
- **Returnable delivery challan** — GST document (CGST Rule 55) used when goods leave the plant for a reason other than
  supply (e.g. calibration) and will return. No tax charged. Serial number ≤ 16 characters.
- **As-found / as-left** — readings before and after adjustment.
- **OOT (out of tolerance)** — calibration failed acceptance criteria; requires disposition and impact assessment.
  `OotCase`: OPEN → ASSESSING → DISPOSITIONED (quality head) → CLOSED. Trigger AS_LEFT_FAIL (instrument on hold) or
  AS_FOUND_FAIL (passed after adjustment; impact assessment only).
- **Verification** — the gauge in-charge checks a returned certificate (checklist + readings) and records PASS/FAIL, or
  rejects a defective certificate back to the lab. AI extraction only prefills; a human always decides.
- **Audit pack** — PDF bundle proving calibration control for auditors (`AuditPack`: QUEUED → RUNNING → READY | FAILED →
  retry), built by the worker: react-pdf sections + pdf-lib merge of certificates, page-stamped.
- **Vendor / VendorLink** — a lab (shared record) and an org's approval of it; vendors are visible only via the link.
- **Release** — turning an approved calibration request into draft POs (contract items, one per lab) and an RFQ (the rest).
- **Roles** — ORG_ADMIN, QUALITY_HEAD, GAUGE_INCHARGE, PURCHASE, STORES, OPERATOR (read-only), VENDOR_USER (portal only).
- **Instrument status** — IN_STORE ↔ IN_USE → AWAITING_DISPATCH → AT_VENDOR → RECEIVED_PENDING_VERIFICATION → IN_STORE |
  ON_HOLD_OOT → IN_STORE | SCRAPPED; any → LOST. DUE_SOON / OVERDUE are computed from `nextDueAt`, not statuses.
- **Calibration job status** — PLANNED → PO_RAISED → DISPATCHED → AT_LAB → RETURNED → CERT_UPLOADED → VERIFIED_PASS |
  VERIFIED_FAIL → CLOSED (in-house jobs skip PO/dispatch).
