-- Add default date fields to SKU table for manufacture and expiry dates
ALTER TABLE "skus"
  ADD COLUMN "default_manufacturing_date" TIMESTAMP(3),
  ADD COLUMN "default_expiry_date" TIMESTAMP(3),
  ADD COLUMN "shelf_life_days" INTEGER;
