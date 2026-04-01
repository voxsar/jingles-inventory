-- CreateTable
CREATE TABLE "sku_vendors" (
    "sku_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,

    CONSTRAINT "sku_vendors_pkey" PRIMARY KEY ("sku_id","vendor_id")
);

-- AddForeignKey
ALTER TABLE "sku_vendors" ADD CONSTRAINT "sku_vendors_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_vendors" ADD CONSTRAINT "sku_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
