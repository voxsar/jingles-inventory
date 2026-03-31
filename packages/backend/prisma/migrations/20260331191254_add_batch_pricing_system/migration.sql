-- CreateTable: Batch table for batch-based pricing management
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "sequence_number" INTEGER NOT NULL,
    "cost_price" DOUBLE PRECISION,
    "selling_price" DOUBLE PRECISION,
    "wholesale_price" DOUBLE PRECISION,
    "bulk_price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "margin_type" TEXT,
    "margin_value" DOUBLE PRECISION,
    "supplier" TEXT,
    "expiry_date" TIMESTAMP(3),
    "manufacturing_date" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add batch_id FK and pricing fields to grn_lines
ALTER TABLE "grn_lines" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "grn_lines" ADD COLUMN "cost_price" DOUBLE PRECISION;
ALTER TABLE "grn_lines" ADD COLUMN "selling_price" DOUBLE PRECISION;
ALTER TABLE "grn_lines" ADD COLUMN "wholesale_price" DOUBLE PRECISION;
ALTER TABLE "grn_lines" ADD COLUMN "bulk_price" DOUBLE PRECISION;

-- AlterTable: Add batch_reference column to inventory_records for legacy support
ALTER TABLE "inventory_records" ADD COLUMN "batch_reference" TEXT;

-- Migrate existing data: Copy old batchId (string) to batchReference in inventory_records
UPDATE "inventory_records" SET "batch_reference" = "batch_id" WHERE "batch_id" IS NOT NULL;

-- AlterTable: Change inventory_records batch_id to be FK to batches table
-- First, set all existing batch_id values to NULL (they're now in batch_reference)
UPDATE "inventory_records" SET "batch_id" = NULL;

-- Now we can safely change the column type without data loss
-- (The old string values are preserved in batch_reference column)

-- CreateIndex: Unique batch_number for batches
CREATE UNIQUE INDEX "batches_batch_number_key" ON "batches"("batch_number");

-- CreateIndex: Unique constraint on skuId + variantId + sequenceNumber
CREATE UNIQUE INDEX "batches_sku_id_variant_id_sequence_number_key" ON "batches"("sku_id", "variant_id", "sequence_number");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
