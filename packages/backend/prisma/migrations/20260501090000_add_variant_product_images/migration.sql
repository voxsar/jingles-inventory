-- Add optional variant scope to product images.
ALTER TABLE "product_images" ADD COLUMN "variant_id" TEXT;

-- Product and variant image ordering is managed per scope by the application.
DROP INDEX IF EXISTS "product_images_sku_id_sort_order_key";
CREATE INDEX "product_images_sku_id_variant_id_sort_order_idx" ON "product_images"("sku_id", "variant_id", "sort_order");

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
