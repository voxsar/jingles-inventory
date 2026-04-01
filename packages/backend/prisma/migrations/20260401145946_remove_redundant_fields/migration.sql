-- AlterTable: Remove redundant fields from models
-- This migration removes batchReference from InventoryRecord and GRNLine,
-- and removes supplier from Batch, as these fields are now replaced by
-- proper foreign key relationships (batchId and vendorId)

-- Remove batchReference from inventory_records
ALTER TABLE "inventory_records" DROP COLUMN IF EXISTS "batch_reference";

-- Remove batchReference from grn_lines
ALTER TABLE "grn_lines" DROP COLUMN IF EXISTS "batch_reference";

-- Remove supplier from batches
ALTER TABLE "batches" DROP COLUMN IF EXISTS "supplier";
