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
| `product` + `productdetail` + `vwStockReport` | SKUs **or SKU variants** (see below), prices, per-branch quantities |
| `productcolorsize` + `productcolorsizedetail` | SKU variants + variant batch prices |
| `purchaseheader` / `purchasedetail` (`DocumentID` 101/102) | Historical GRNs and PRNs (audit-only; stock is not applied twice) |
| `transfernoteheader` / `transfernotedetail`, `adjustmentheader` / `adjustmentdetail` | Historical transfers and adjustment events (audit-only) |
| Purchase `DocumentID` 100 and invoice `DocumentID` 105 | Purchase-order and quotation reports |
| Every legacy base table (including sales, purchasing, stock ledger, reports, customers, loyalty, vouchers, configuration and permissions) | Lossless current mirror plus append-only versions in `legacy_pos_records` / `legacy_pos_record_versions` |

The first cycle sends the whole catalog and every legacy base-table row (the server applies idempotently).
Afterwards the five-minute cycle always updates catalog, `vwStockReport`, GRN,
PRN, transfer, adjustment and quotation/order sources. A complete all-table
audit defaults to every 1,440 minutes (configurable in the app) so the 3.7M-row
archive does not block routine inventory updates. The app keeps one
content-hash per legacy row locally and only pushes rows that changed. **Full
re-sync** always scans all tables immediately.

All archived legacy rows retain their original table and column names because
deployed legacy databases use several schema revisions. This preserves sales,
payments, opening/closing values, cash declarations and stored Z/day-end data
without guessing or dropping installation-specific columns. Historical sales
are deliberately not applied as inventory deductions: current legacy on-hand
quantities are already mirrored separately, so deducting them again would
corrupt stock.

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
4. **Quantities mirror the POS.** Legacy `vwStockReport` balances per location are
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
- `GET /api/legacy-sync/pos-records?sourceTable=invoiceheader` inspects any
  mirrored legacy table and its original row payloads.
- Run history lives in `legacy_sync_runs`; every quantity change is an
  `inventory_events` row with the run id in its metadata.

## Known limits

- Legacy `vwStockReport` stock is product-level, so products that have legacy
  color/size rows mirror quantity at the SKU total (the per-variant split does
  not exist in the legacy schema). Merged products (one legacy product per
  variant) mirror exactly at variant level.
- If legacy on-hand drops below what non-legacy records (GRNs created here)
  hold, the app logs a warning and a negative sync balance is recorded so
  branch totals still match the POS — review those SKUs manually.
- Customer, loyalty and general-ledger/accounting domains are not converted
  into first-class new-system entities. POS operational/report rows are fully
  mirrored losslessly, but installation-specific fields remain in their
  original JSON shape until a dedicated UI/report mapping is added.
- Passwords, PINs, tokens, secrets and credential material are redacted by the
  desktop extractor and are never sent to either new application.
