# Jingles Legacy Desktop Sync Agent

A small background service that runs on the shop desktop next to the **legacy POS
database** (MSSQL — the original system — or a MySQL copy of it) and pushes
changes into the new Jingles inventory server every 5 minutes.

## What it syncs

| Legacy table | New system |
| --- | --- |
| `unitofmeasure` | Units of measure |
| `supplier` | Vendors |
| `location` | Branches (+ default `MAIN` floor) |
| `department` / `category` / `subcategory1-3` | Category tree (per product) |
| `product` + `productdetail` | SKUs **or SKU variants** (see below), prices, per-branch quantity |
| `productcolorsize` + `productcolorsizedetail` | SKU variants + variant batch prices |

### How variant merges are respected

Some legacy products were merged into **variant families** in the new system
(one master SKU with `SKUVariant` rows). The server keeps a persistent
`legacy_entity_links` table mapping every legacy row to its target entity:

1. An existing link always wins — once a legacy product points at a variant,
   it stays a variant forever, even though the legacy DB still sees a plain product.
2. A new legacy product is first matched against `SKUVariant.variantCode`
   (the merge tooling stores the original product code there), then against
   `SKU.skuCode`, then barcodes. Only if nothing matches is a new SKU created.
3. Updates are applied with a three-way merge: a field is only written when it
   actually changed **in the legacy system** since the last sync. Curation done
   in the new system (renames, repricing after a merge) is never clobbered by
   a legacy value that has not moved.
4. Quantities are mirrored per branch as auditable `LEGACY_SYNC_ADJUSTMENT`
   inventory events; for merged products the quantity flows to the variant.

## Setup

### 1. Server side

Add a shared secret to the backend environment (`.env` / PM2):

```
JINGLES_LEGACY_SYNC_TOKEN=<long random string>
```

The agent authenticates with this token via the `x-jingles-legacy-sync-token`
header against `/api/legacy-sync/*`.

### 2. Build the agent

From the repo root:

```bash
npm install
npm run build --workspace=packages/shared
npm run build --workspace=packages/sync-agent
```

Copy the `packages/sync-agent` folder (with `dist/`) to the shop desktop and run
`npm install --omit=dev` there (installs only the `mssql`/`mysql2` drivers).

### 3. Configure

```bash
cp sync-agent.config.example.json sync-agent.config.json
```

- `legacyDatabase.dialect`: `mssql` for the original POS database, `mysql` for a converted copy.
- `legacyDatabase.password` can stay out of the file — set `JINGLES_LEGACY_DB_PASSWORD` instead.
- `server.token` supports `env:VAR_NAME`, or set `JINGLES_LEGACY_SYNC_TOKEN`.
- `intervalMinutes` defaults to 5.

### 4. First run

```bash
node dist/index.js --once        # single cycle, prints what it does
node dist/index.js               # daemon: full sync, then every 5 minutes
node dist/index.js --once --full # re-send everything (ignores local state)
```

The first cycle sends the whole catalog (the server applies it idempotently);
afterwards only rows whose content changed are sent — the agent keeps a hash
per legacy row in `sync-agent.state.json`.

## Running in the background

**Windows (recommended — NSSM):**

```bat
nssm install JinglesSyncAgent "C:\Program Files\nodejs\node.exe" "C:\jingles-sync-agent\dist\index.js" "--config" "C:\jingles-sync-agent\sync-agent.config.json"
nssm set JinglesSyncAgent AppDirectory C:\jingles-sync-agent
nssm set JinglesSyncAgent AppEnvironmentExtra JINGLES_LEGACY_SYNC_TOKEN=<token> JINGLES_LEGACY_DB_PASSWORD=<password>
nssm start JinglesSyncAgent
```

**Windows (Task Scheduler):** create a task that runs
`node C:\jingles-sync-agent\dist\index.js` **At startup**, with
"Run whether user is logged on or not". The agent loops internally, so a
single always-running task is enough — no per-5-minute trigger needed.

**PM2 (any OS):**

```bash
pm2 start dist/index.js --name jingles-sync-agent -- --config /path/to/sync-agent.config.json
pm2 save
```

## Notes & limits

- The legacy system soft-deletes rows (`IsDelete`), which the sync turns into
  `isActive = false` on the linked SKU/variant. Rows hard-deleted from legacy
  tables are simply ignored (nothing is deleted in the new system).
- Legacy `productdetail.Qty` is product-level. For products that have legacy
  color/size rows, the quantity is mirrored at the SKU total (the per-variant
  split is not available in the legacy schema). Merged products (one legacy
  product per variant) mirror exactly at variant level.
- If legacy on-hand drops below what non-legacy records (GRNs etc.) hold in
  the new system, the agent logs a server warning and a negative sync balance
  is recorded so branch totals still match the POS.
- Inspect link decisions any time: `GET /api/legacy-sync/status` and
  `GET /api/legacy-sync/links?sourceType=product` (admin JWT or sync token).
