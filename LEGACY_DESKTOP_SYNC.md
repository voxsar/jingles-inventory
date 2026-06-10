# Legacy Desktop Sync

Continuous sync from the **legacy desktop POS database** (MSSQL — no API
there; everything is sourced directly with `SELECT` queries) into the new
inventory system, running **every 5 minutes**.

The sync is deliberately **not part of the backend**: it is a temporary,
standalone Electron application — [packages/legacy-sync-app](packages/legacy-sync-app/) —
that runs on the shop desktop next to the SQL Server and can be uninstalled
the day the legacy POS retires. The backend only exposes small receiving
endpoints plus the permanent link bookkeeping.

```
shop desktop                                this server
┌──────────────────────────────┐            ┌──────────────────────────────┐
│ legacy MSSQL  ◄── SELECTs ── │            │  backend /api/legacy-sync    │
│ Jingles Legacy Sync (Electron│ ── push ──►│  apply service + links       │
│ app, tray, 5-min loop)       │            │  Postgres                    │
└──────────────────────────────┘            └──────────────────────────────┘
```

## Setup

1. **Server:** add `JINGLES_LEGACY_SYNC_TOKEN=<long random string>` to the
   backend env and deploy (`npm run deploy:backend`).
2. **Desktop:** package the app — `npm run dist:win --workspace=packages/legacy-sync-app` —
   and install the NSIS/portable build from `packages/legacy-sync-app/release/`
   on the shop machine.
3. In the app window fill in the legacy MSSQL connection (a read-only login is
   enough), the new system URL, the sync token, and enable **Sync automatically**.
   The app sits in the tray; closing the window keeps it syncing.

## What gets synced

| Legacy tables (read-only SELECTs) | New system |
| --- | --- |
| `unitofmeasure` | Units of measure |
| `supplier` | Vendors |
| `location` | Branches (+ default `MAIN` floor) |
| `department` / `category` / `subcategory1-3` | Category tree (same slugs as the one-time importer) |
| `product` + `productdetail` | SKUs **or SKU variants** (see below), prices, per-branch quantities |
| `productcolorsize` + `productcolorsizedetail` | SKU variants + variant batch prices |

The first cycle sends the whole catalog (the server applies idempotently);
afterwards the app keeps one content-hash per legacy row locally and only
pushes rows that actually changed.

## How variant merges are respected

Some legacy products were merged into **variant families** here (one master
SKU with `SKUVariant` rows) — the legacy database still sees them as separate
products. The server keeps them variants forever:

1. **Persistent links.** Every legacy row is mapped in `legacy_entity_links`
   (legacy `ProductID` → SKU *or* variant). An existing link always wins; a
   variant-linked product keeps syncing into its variant no matter what shape
   the legacy schema has.
2. **Merge-aware matching for new links.** An unlinked legacy product is first
   matched against `SKUVariant.variantCode` — the variant-family tooling stores
   the original product code there when it merges a product — then against
   `SKU.skuCode`, then barcodes. Only when nothing matches is a new SKU created.
3. **Three-way merge for fields.** Name, active flag and prices are written
   only when the value changed *in the legacy system* since the last applied
   value (stored on the link). Curation done here — renames, repricing after a
   merge — is never clobbered by a legacy value that has not moved. On first
   contact with a pre-existing record only missing values are filled in.
4. **Quantities mirror the POS.** Legacy `productdetail.Qty` per location is
   mirrored to the matching branch as auditable `LEGACY_SYNC_ADJUSTMENT`
   inventory events (terminal `legacy-desktop-sync`). For merged products the
   quantity flows to the variant; price changes flow to the variant's price
   batch (the same batch the merge tooling created), not to a new SKU.
5. **Deactivations flow, deletions don't.** Legacy soft-deletes
   (`IsDelete`/`IsActive`) set `isActive=false` on the linked SKU/variant.
   Nothing is ever deleted here, and rows hard-deleted from the legacy tables
   are simply left alone.

## Server endpoints (auth: `x-jingles-legacy-sync-token` header or admin JWT)

- `POST /api/legacy-sync/runs` / `.../chunks` / `.../complete` — used by the
  desktop app to push changes.
- `GET /api/legacy-sync/status` — recent runs and link counts.
- `GET /api/legacy-sync/links?sourceType=product&q=P101` — inspect how legacy
  rows are mapped (`resolution`: `variant-code`, `sku-code`, `barcode`,
  `created`, `manual`). Set `isLocked` on a row to pin a mapping permanently.
- Run history lives in `legacy_sync_runs`; every quantity change is an
  `inventory_events` row with the run id in its metadata.

## Known limits

- Legacy `productdetail.Qty` is product-level, so products that have legacy
  color/size rows mirror quantity at the SKU total (the per-variant split does
  not exist in the legacy schema). Merged products (one legacy product per
  variant) mirror exactly at variant level.
- If legacy on-hand drops below what non-legacy records (GRNs created here)
  hold, the app logs a warning and a negative sync balance is recorded so
  branch totals still match the POS — review those SKUs manually.
- Sales/invoices, customers, loyalty and accounting tables are out of scope;
  this sync covers catalog, suppliers, locations, prices and stock balances.
