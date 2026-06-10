# Jingles Legacy Sync (standalone Electron app)

A separate, temporary desktop application that runs on the shop machine next to
the **legacy POS database** (a desktop MSSQL server — no API there; everything
is sourced directly with `SELECT` queries). Every 5 minutes it diffs the legacy
catalog and pushes changes into the new Jingles inventory system.

It is its own Electron app — not part of the backend and not part of the main
Jingles desktop app — so it can be uninstalled the day the legacy POS retires.

## Build & run (development)

```bash
npm install                                       # repo root
npm run build --workspace=packages/shared
npm run build --workspace=packages/legacy-sync-app
npx electron packages/legacy-sync-app             # launches the app
```

## Package a Windows installer

```bash
npm run dist:win --workspace=packages/legacy-sync-app
```

Output lands in `packages/legacy-sync-app/release/` (NSIS installer +
portable exe). Install it on the shop desktop.

## Configure (in the app window)

- **Legacy database** — dialect `MSSQL`, host/port/database/user/password of
  the desktop SQL Server (a read-only login is enough), schema `dbo`.
  `MySQL` is available for converted copies of the same schema.
- **New system URL** — the inventory server, e.g. `https://inventory.example.com`.
- **Sync token** — must match `JINGLES_LEGACY_SYNC_TOKEN` in the backend env.
- **Sync every** — default 5 minutes. Enable **Sync automatically**.

The app lives in the system tray; closing the window keeps it syncing in the
background. Quit from the tray menu. Config + change-detection state are stored
in the app's user-data folder.

**Buttons:** *Sync now* runs a cycle immediately, *Full re-sync* re-applies the
entire legacy snapshot, *Reset state* clears local change detection so the next
cycle re-sends everything (safe — the server applies idempotently).

## How merges/variants are protected

The server keeps a persistent link per legacy row (`legacy_entity_links`).
Products merged into variant families here keep syncing into **their variant**
forever — matching checks `variantCode` (where the merge tooling stores the
original product code) before `skuCode`, and an existing link always wins.
Field updates are three-way merged so only values that actually changed in the
legacy system are written; quantities mirror the POS per branch as auditable
`LEGACY_SYNC_ADJUSTMENT` events. See [LEGACY_DESKTOP_SYNC.md](../../LEGACY_DESKTOP_SYNC.md).
