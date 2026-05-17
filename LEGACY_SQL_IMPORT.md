# Legacy SQL Import

This repo now includes a deterministic legacy MySQL migration helper for the old inventory and POS database shape in [Dump20260508.sql](/var/www/jingles-inventory/Dump20260508.sql).

## What It Supports

- `supplier` -> `vendors`
- `unitofmeasure` -> `units_of_measure`
- `location` -> `branches` plus one auto-created default `floor` per branch
- `department` / `category` / `subcategory1-3` -> recursive `categories`
- `product` / `productdetail` -> `skus`, `product_barcodes`, `sku_vendors`
- `colour` / `size` / `productcolorsize` -> `attributes`, `attribute_values`, `sku_attributes`, `sku_variants`
- `purchaseheader` / `purchasedetail` -> historical `grns`, `grn_lines`, and reusable `batches`
- `transfernoteheader` / `transfernotedetail` -> historical `stock_transfers`, `stock_transfer_lines`
- `adjustmentheader` / `adjustmentdetail` -> audit-style `inventory_events`
- `stock`, `productdetail`, or `purchasedetail` balances -> synthetic `batches` plus `inventory_records`

## Important Gaps

- The uploaded `Dump20260508.sql` is schema-only. It has no `INSERT INTO` statements, so it cannot populate records yet.
- The old system stores quantities as `decimal(18,3)`. Inventory records now support decimals, but GRNs, PRNs, inspections, and transfers are still whole-unit workflows.
- The current schema does not model POS sales, payments, customers, loyalty, gift vouchers, or accounting tables from the old system.
- Variant-level pricing, text bin locations, serial numbers, warranty, and many legacy configuration flags are only partially represented.

## Run Analysis

From the repo root:

```bash
npm exec --workspace=packages/backend ts-node src/scripts/importLegacySqlDump.ts -- --file Dump20260508.sql --analyze
```

This prints:

- what source tables were found
- whether the dump contains data rows
- which domains map cleanly into the current schema
- which legacy areas are still missing from the current product

The CLI now streams the SQL file instead of reading the whole dump into memory. It only retains the legacy tables and columns needed for the supported migration path.

If you already have a matching schema-only dump, you can seed the parser with it and skip the schema-discovery pass for very large data-only exports:

```bash
npm exec --workspace=packages/backend ts-node src/scripts/importLegacySqlDump.ts -- --file total_data.sql --schema-file Dump20260508.sql --analyze
```

## Apply an Import

Use a full legacy SQL dump that includes `INSERT INTO` rows:

```bash
npm exec --workspace=packages/backend ts-node src/scripts/importLegacySqlDump.ts -- --file /path/to/full-legacy-dump.sql --apply
```

For a large data-only export that matches `Dump20260508.sql`, prefer:

```bash
npm exec --workspace=packages/backend ts-node src/scripts/importLegacySqlDump.ts -- --file total_data.sql --schema-file Dump20260508.sql --apply
```

Useful options:

```bash
--inventory-state ShelfReady
--fractional-qty preserve
--fractional-qty skip
--fractional-qty round
--default-floor-code MAIN
--default-floor-name "Main Floor"
```

## Current Import Behavior

- The importer creates idempotent synthetic legacy batches so stock imports can be re-run safely.
- When `stock` rows are present, they are preferred over `productdetail` for inventory snapshot creation.
- Fractional stock rows are preserved by default. Use `--fractional-qty round` or `--fractional-qty skip` only if you want to coerce legacy decimals.
- Purchase history is imported as historical GRNs when supplier/product/location references resolve cleanly, and it can be reconstructed from `purchasedetail` rows if `purchaseheader` rows are missing.
- Transfer-note history is imported as stock transfer documents when the legacy locations can be mapped into current branches/floors.
- Adjustment history is preserved as metadata-rich inventory events so the legacy audit trail is not lost even though current on-hand stock still comes from the imported snapshot.
- If `stock` has no rows and `productdetail.Qty` is empty or zeroed out, the importer falls back to `purchasedetail` balances to recover on-hand inventory.
- GRN and transfer line quantities are still whole-unit models in the current app, so legacy fractional document quantities are rounded with warnings while the exact legacy values are preserved in notes/metadata.
- If the SQL file ends mid-statement, analysis/import stops with an error so you do not migrate from a partially uploaded dump.
