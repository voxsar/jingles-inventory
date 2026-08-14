# Jingles Inventory Agent Guide

## Repository purpose

This repository is the inventory system of record. It is an npm-workspaces TypeScript monorepo:

- `packages/shared`: shared domain types, enums, and transition rules.
- `packages/backend`: Express API, Prisma, PostgreSQL, migrations, sync, OCR, and reporting.
- `packages/web`: React/Vite application.
- `packages/electron`: desktop shell, local SQLite replica, hardware integration, and offline sync.

Read `README.md` and any feature-specific root documentation before changing a related workflow. Keep public API and sync-contract changes compatible with the separate Jingles POS repository.

<!--
  Postmortem, kept out of the rendered guide but not out of the source an agent
  actually reads: a session was asked to add cashier keyboard shortcuts to
  "the POS" and, without opening this file first, built a whole parallel POS
  terminal (route, cart, popups, sale/shift/refund endpoints) inside this
  inventory repo instead. Line 12 above already said the POS is a separate
  repository. It was findable in one `ls` at the workspace root
  (`../federation-commerce`, packages/web/src/posWorkstation.tsx) and would
  have taken one command to confirm before writing a single file.

  This repository is the inventory system of record. It is not the POS and
  never becomes the POS by adding a checkout screen to it. If a task talks
  about ringing up a sale, a till, a cashier, a shift, tender, a receipt
  printer, or a cash drawer, that is `federation-commerce`, not here — go
  read its AGENTS.md before writing code. If that repository is genuinely
  not present on the machine, say so and ask, rather than building a
  substitute.
-->

## Working rules

- Use npm workspaces and the existing package structure. Do not introduce another package manager.
- Put cross-package contracts in `packages/shared`; do not duplicate domain enums or interfaces.
- Make the smallest coherent change and preserve unrelated worktree changes.
- Do not commit credentials, tokens, database URLs, runtime databases, dumps, uploads, or generated build artifacts.
- Do not add or upgrade production dependencies without explaining the need and compatibility impact.
- Use Context7 when current third-party library documentation is needed.
- DBHub is for read-only development diagnostics. Never use it to mutate data or schema.

## Domain invariants

- Preserve role-based access control and vendor data isolation at the query and service boundaries.
- Inventory state changes must go through the transition rules and create the required audit/event records.
- Treat inventory events, audit logs, and sync logs as append-only unless an existing documented maintenance workflow explicitly says otherwise.
- Stock, GRN, transfer, voucher, pricing, and redemption operations that change multiple records must remain atomic.
- Offline operations must be idempotent, version-aware, replay-safe, and conflict-visible. Do not silently discard or overwrite conflicts.
- Preserve barcode uniqueness and existing SKU/variant/batch relationships.
- Currency and quantity calculations must follow existing rounding and conversion behavior; add boundary tests for changes.

## Database and migrations

- `packages/backend/prisma/schema.prisma` is the canonical PostgreSQL schema.
- The local SQLite Prisma schema/client is generated for the Electron replica. Do not hand-edit files under `packages/generated/` or `packages/backend/generated/`.
- Create a new migration for schema changes. Never rewrite an applied migration.
- Never run `prisma migrate reset`, drop a database, truncate tables, or delete runtime SQLite files without explicit user approval and a verified target.
- Review generated SQL before applying a migration. Account for existing rows, nullability, defaults, indexes, uniqueness, and rollback/recovery.
- Keep PostgreSQL schema, generated SQLite schema, replica export/import, and sync serialization compatible.
- Use Prisma transactions or an existing transaction boundary for multi-record business mutations.

## Commands

Run commands from the repository root unless a command says otherwise.

```powershell
npm install
npm run dev:backend
npm run dev:web
npm run dev:electron
npm run lint
npm test
npm run build
```

Targeted verification:

```powershell
npm run test:shared
npm run test:backend
npm run test:web
npm run test:electron
npm run test:coverage
```

Database commands are run in `packages/backend`:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Do not seed a non-development database.

## Verification expectations

- Start with the tests closest to the changed code, then run the affected workspace tests.
- Run `npm run lint` for frontend or lint-sensitive changes.
- Run `npm run build` for shared contracts, Prisma schema, API, packaging, or cross-package changes.
- For schema changes, verify Prisma generation and inspect the migration SQL.
- For sync changes, test offline queueing, duplicate delivery, ordering, reconnect, conflict, and full-replica replacement paths.
- For UI flows, prefer durable Playwright tests or existing component tests over manual-only validation.
- Report tests that were not run and the reason.

## Code review rules

- Flag any path that bypasses RBAC, vendor scoping, state transitions, audit events, or transaction boundaries.
- Flag destructive migration steps, unbounded queries, N+1 query regressions, and changes that make sync non-idempotent.
- Flag secrets, production endpoints, or personal data added to code, fixtures, logs, screenshots, or configuration.
- Flag direct edits to generated Prisma output or runtime database files.
