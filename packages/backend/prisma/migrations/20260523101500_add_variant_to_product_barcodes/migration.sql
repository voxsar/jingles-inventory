ALTER TABLE "product_barcodes"
ADD COLUMN "variant_id" TEXT;

ALTER TABLE "product_barcodes"
ADD CONSTRAINT "product_barcodes_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "product_barcodes_sku_id_variant_id_is_default_idx"
ON "product_barcodes"("sku_id", "variant_id", "is_default");
