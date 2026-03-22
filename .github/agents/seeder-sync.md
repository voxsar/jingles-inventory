# Agent: Seeder Sync

## Purpose

Keep the Prisma seed files in sync with `schema.prisma` whenever the schema changes. Also audit cascading-delete/update rules and propagate awareness of those changes to all other agent instruction files.

## Trigger

Activate whenever **any** of the following files is modified:

- `packages/backend/prisma/schema.prisma`

## Files Managed by This Agent

| File | Role |
|---|---|
| `packages/backend/src/prisma/seed.ts` | Primary seed (admin user, sample vendor/SKU, `StatusOption` rows) |
| `packages/backend/src/prisma/seed-stress.ts` | Stress-test seed (Branch → Floor → Rack → Shelf → 10 000 SKUs + InventoryRecords) |

## Rules

### 1. New model added to the schema

- Determine whether the model requires seed data (lookup tables, system options, mandatory reference rows).
- If **yes**, add an idempotent seed block to `seed.ts` using the same guard pattern already used in that file:
  ```typescript
  const existing = await prisma.<modelName>.findFirst({ where: { /* unique key */ } });
  if (!existing) {
    await prisma.<modelName>.create({ data: { /* required fields */ } });
    console.log('Seed: created <model description>');
  }
  ```
- If the model is purely a join/event table driven by other seed records, **do not** add an explicit seed block — the parent seed will create them via relations.
- For large-volume or infrastructure models (branches, floors, racks, shelves), add the block to `seed-stress.ts` instead and follow the existing idempotent-check pattern used there.

### 2. Model removed from the schema

- Remove **all** references to the deleted model's Prisma accessor from both seed files.
- Search for:
  - `prisma.<camelCaseModel>` calls
  - Type annotations referencing the model
  - Imports that are no longer needed (e.g. no longer using a helper from `@prisma/client`)
- If the removed model had `onDelete: Cascade` children, verify those child seed blocks (if any) are also removed, since the parent rows will no longer exist.

### 3. Required field added to an existing model

- Locate every `prisma.<model>.create(...)` and `prisma.<model>.createMany(...)` call in both seed files.
- Add the new field with a sensible default or placeholder value.
- If the field has a `@default(...)` in the schema it is optional in the seed call — leave it out unless the seed data should override the default.

### 4. Field removed from an existing model

- Remove the field from every `data: { ... }` object in both seed files that currently supplies it.
- If the field was part of a `findUnique` `where` clause, update that clause to use the new unique key.

### 5. Field renamed (via `@map` change or Prisma field rename)

- The Prisma client field name (camelCase TypeScript name) changes, **not** the database column name.
- Update every usage of the old TypeScript field name in both seed files.

### 6. `@@map` table rename

- No seed file changes required — the Prisma client accessor name is unchanged.

### 7. Unique constraint changed (`@@unique` or `@unique`)

- Update `findUnique` / `findFirst` guards in both seed files so they use the current unique key(s).

### 8. `@id` or `@default` change

- If the primary key strategy changes (e.g. from `uuid()` to `cuid()`), check whether any seed block hard-codes an `id` value and remove it so the database generates the key.

---

## Cascade Change Monitoring

Every time you process a schema diff, scan for changes to `onDelete` and `onUpdate` relationship options.

### When a cascade rule is **added** (`onDelete: Cascade` or `onUpdate: Cascade`)

1. Identify the **parent** model (the side that owns the foreign key field referenced by `references: [id]`).
2. Add a comment block immediately above the parent's seed block in the relevant seed file:
   ```typescript
   // ⚠️ CASCADE: deleting this <ParentModel> will also delete all related
   // <ChildModel> rows (onDelete: Cascade on <ChildModel>.<fieldName>).
   // Ensure stress-test cleanup and integration-test teardown account for this.
   ```
3. If the child model has its own seed block, reorder the seed calls so the parent is always seeded **before** the child.

### When a cascade rule is **removed**

- Remove or update the cascade comment block added in step 2 above.
- If the child seed block depended on the parent being present (no orphan protection), add a defensive `findFirst` guard around the child seed block.

### When cascade depth increases (grandparent → parent → child)

- Document the full cascade chain in a comment at the top of whichever seed function seeds the root ancestor.

---

## Propagating Changes to Other Agent Files

After updating the seed files, check every file in `.github/agents/` for references to:

- Model names that were added, removed, or renamed
- Field names that changed
- Cascade rules that changed

For each affected agent file:

1. Update any model or field name references to match the new schema.
2. If a cascade rule changes the deletion behaviour of a model that another agent manages, add a warning note in that agent file explaining the cascade impact.
3. Do **not** change the core purpose or trigger conditions of the other agent — only update factual model/field references.

---

## Idempotency Requirement

All seed blocks must be **safe to run multiple times** against a populated database:

- Use `findUnique` / `findFirst` with a stable unique key before every `create`.
- Use `createMany({ ..., skipDuplicates: true })` for bulk inserts.
- Never use plain `create` without a prior existence check.

---

## Prisma Client Accessor Naming

When the schema adds a new model `MyNewModel`, the Prisma client accessor is the **camelCase** version of the model name:

| Schema model name | Prisma accessor |
|---|---|
| `StatusOption` | `prisma.statusOption` |
| `SKU` | `prisma.sKU` |
| `GRN` | `prisma.gRN` |
| `UnitOfMeasureModel` | `prisma.unitOfMeasureModel` |
| `StorageBox` | `prisma.storageBox` |

Always derive the accessor name from the Prisma client type definitions, not by guessing.

---

## Current Seeded Models Reference

The table below reflects the state of the seed files at the time this agent file was created. Update it whenever you add or remove a seed block.

### `seed.ts`

| Model | Unique guard key | Notes |
|---|---|---|
| `User` | `email` | Admin user (`admin@theredsun.org`) and Manager user (`manager@jingles.com`) |
| `Vendor` | `name = 'Sample Vendor'` | Sample reference vendor |
| `SKU` | `skuCode = 'SKU-001'` | Sample product linked to Sample Vendor |
| `StatusOption` | `entityType + value` | All system statuses for `inventory`, `grn`, `stock_transfer`, `damage_classification`, `vendor_type` |

### `seed-stress.ts`

| Model | Unique guard key | Notes |
|---|---|---|
| `Vendor` | `name = 'Stress Test Vendor'` | Parent for all stress SKUs |
| `Branch` | `code = 'STRESS-01'` | Single stress-test branch |
| `Floor` | `branchId + code` | 3 floors |
| `Rack` | `floorId + code` | 5 racks per floor (15 total) |
| `Shelf` | `rackId + code` | 8 shelves per rack (120 total) |
| `SKU` | `skuCode LIKE 'STRESS-%'` | 10 000 stress SKUs (batch insert) |
| `InventoryRecord` | _(implicit via skipDuplicates)_ | 1 record per SKU distributed across shelves |

---

## Cascade Relationships in Current Schema

The following `onDelete: Cascade` rules exist as of the initial schema. Seeding must respect parent-before-child ordering.

| Parent model | Child model | Child field |
|---|---|---|
| `SKU` | `SKUTag` | `skuId` |
| `Tag` | `SKUTag` | `tagId` |
| `Attribute` | `AttributeValue` | `attributeId` |
| `SKU` | `SKUAttribute` | `skuId` |
| `Attribute` | `SKUAttribute` | `attributeId` |
| `SKUAttribute` | `SKUAttributeValue` | `skuAttributeId` |
| `AttributeValue` | `SKUAttributeValue` | `attributeValueId` |
| `SKU` | `SKUVariant` | `skuId` |
| `SKUVariant` | `SKUVariantValue` | `variantId` |
| `SKU` | `ProductImage` | `skuId` |
| `SKU` | `ProductBarcode` | `skuId` |
| `StorageBox` | `BoxBarcode` | `boxId` |
| `StockTransfer` | `StockTransferLine` | `transferId` |

> ⚠️ If any of these parent models are deleted during integration-test teardown, the cascade will automatically remove all child rows. Seed blocks for child models do **not** need their own cleanup steps.
