-- CreateTable
CREATE TABLE "prns" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "inspection_record_id" TEXT,
    "floor_id" TEXT,
    "shelf_id" TEXT,
    "return_reason" TEXT,
    "expected_pickup_date" TIMESTAMP(3),
    "pickup_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prn_lines" (
    "id" TEXT NOT NULL,
    "prn_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "return_quantity" INTEGER NOT NULL,
    "picked_up_quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "prn_lines_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "prns" ADD CONSTRAINT "prns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prns" ADD CONSTRAINT "prns_inspection_record_id_fkey" FOREIGN KEY ("inspection_record_id") REFERENCES "inspection_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prns" ADD CONSTRAINT "prns_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prns" ADD CONSTRAINT "prns_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prns" ADD CONSTRAINT "prns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_lines" ADD CONSTRAINT "prn_lines_prn_id_fkey" FOREIGN KEY ("prn_id") REFERENCES "prns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_lines" ADD CONSTRAINT "prn_lines_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_lines" ADD CONSTRAINT "prn_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_lines" ADD CONSTRAINT "prn_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
