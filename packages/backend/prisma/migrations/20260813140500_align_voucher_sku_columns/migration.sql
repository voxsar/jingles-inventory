UPDATE "skus" SET "is_voucher" = false WHERE "is_voucher" IS NULL;

ALTER TABLE "skus"
  ALTER COLUMN "is_voucher" SET NOT NULL,
  ALTER COLUMN "voucher_min_value" SET DATA TYPE DECIMAL(10,2),
  ALTER COLUMN "voucher_max_value" SET DATA TYPE DECIMAL(10,2);
