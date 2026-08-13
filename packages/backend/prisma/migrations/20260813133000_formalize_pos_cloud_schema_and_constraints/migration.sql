-- Canonicalize tables that were previously created by runtime POS cloud code.
CREATE TABLE IF NOT EXISTS "legacy_pos_records" (
  "source_table" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_synced_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "legacy_pos_records_pkey" PRIMARY KEY ("source_table", "source_id")
);

CREATE TABLE IF NOT EXISTS "legacy_pos_record_versions" (
  "id" TEXT NOT NULL,
  "source_table" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "content_hash" TEXT NOT NULL,
  "sync_run_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "legacy_pos_record_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_shifts" (
  "id" TEXT NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opening_float" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "closing_float" DOUBLE PRECISION,
  "notes" TEXT,
  "opening_declaration" JSONB,
  "closing_declaration" JSONB,
  "synced" BOOLEAN NOT NULL DEFAULT true,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closed_at" TIMESTAMPTZ,
  CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_held_sales" (
  "id" TEXT NOT NULL,
  "hold_number" TEXT NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "cashier_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'HELD',
  "subtotal" DOUBLE PRECISION NOT NULL,
  "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "lines" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pos_held_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_sales" (
  "id" TEXT NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "user_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "shift_id" TEXT,
  "held_sale_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "subtotal" DOUBLE PRECISION NOT NULL,
  "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL,
  "margin_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lines" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "payments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source_device_id" TEXT,
  "source_sequence_num" INTEGER,
  "synced" BOOLEAN NOT NULL DEFAULT true,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_returns" (
  "id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "reason" TEXT,
  "total_refund" DOUBLE PRECISION NOT NULL,
  "lines" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source_device_id" TEXT,
  "source_sequence_num" INTEGER,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pos_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_sync_events" (
  "id" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "device_id" TEXT NOT NULL,
  "terminal_id" TEXT,
  "sequence_num" INTEGER NOT NULL,
  "lamport" INTEGER NOT NULL,
  "conflict_policy" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_at" TIMESTAMPTZ,
  CONSTRAINT "pos_sync_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_sync_device_states" (
  "id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "terminal_id" TEXT,
  "last_sequence_num" INTEGER NOT NULL DEFAULT 0,
  "vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confirmed_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "online" BOOLEAN NOT NULL DEFAULT false,
  "last_error" TEXT,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_sync_at" TIMESTAMPTZ,
  CONSTRAINT "pos_sync_device_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_sync_conflicts" (
  "id" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "local_event_id" TEXT,
  "remote_event_id" TEXT,
  "policy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "detail" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "pos_sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "legacy_pos_record_versions_source_table_source_id_content_hash_key" ON "legacy_pos_record_versions"("source_table", "source_id", "content_hash");
CREATE INDEX IF NOT EXISTS "legacy_pos_records_table_idx" ON "legacy_pos_records"("source_table");
CREATE UNIQUE INDEX IF NOT EXISTS "pos_held_sales_hold_number_key" ON "pos_held_sales"("hold_number");
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sales_receipt_number_key" ON "pos_sales"("receipt_number");
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sync_events_device_sequence_idx" ON "pos_sync_events"("device_id", "sequence_num");
CREATE INDEX IF NOT EXISTS "pos_sync_events_aggregate_idx" ON "pos_sync_events"("aggregate_type", "aggregate_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sync_device_states_device_id_key" ON "pos_sync_device_states"("device_id");

-- Backfill and enforce current voucher nullability.
UPDATE "voucher_batches" SET "generated_count" = 0 WHERE "generated_count" IS NULL;
UPDATE "voucher_batches" SET "status" = 'pending' WHERE "status" IS NULL;
UPDATE "voucher_restrictions" SET "cannot_combine_with_discounts" = true WHERE "cannot_combine_with_discounts" IS NULL;
UPDATE "voucher_restrictions" SET "cannot_combine_with_other_vouchers" = true WHERE "cannot_combine_with_other_vouchers" IS NULL;
UPDATE "voucher_restrictions" SET "priority" = 0 WHERE "priority" IS NULL;

ALTER TABLE "voucher_batches" ALTER COLUMN "generated_count" SET NOT NULL;
ALTER TABLE "voucher_batches" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "voucher_restrictions" ALTER COLUMN "cannot_combine_with_discounts" SET NOT NULL;
ALTER TABLE "voucher_restrictions" ALTER COLUMN "cannot_combine_with_other_vouchers" SET NOT NULL;
ALTER TABLE "voucher_restrictions" ALTER COLUMN "priority" SET NOT NULL;

-- Constraints present in Prisma but missing from older production databases.
CREATE UNIQUE INDEX IF NOT EXISTS "floors_branch_id_code_key" ON "floors"("branch_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "racks_floor_id_code_key" ON "racks"("floor_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "shelves_floor_id_code_key" ON "shelves"("floor_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_overlays_name_key" ON "pricing_overlays"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "storage_boxes_code_key" ON "storage_boxes"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_transfer_lines_transfer_id_sku_id_variant_id_batch_id_key" ON "stock_transfer_lines"("transfer_id", "sku_id", "variant_id", "batch_id");
