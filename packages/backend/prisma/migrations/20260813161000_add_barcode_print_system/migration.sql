-- CreateTable
CREATE TABLE "barcode_print_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "page_width_mm" DOUBLE PRECISION NOT NULL DEFAULT 210,
    "page_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 297,
    "margin_top_mm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "margin_right_mm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "margin_bottom_mm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "margin_left_mm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "columns" INTEGER NOT NULL DEFAULT 3,
    "rows" INTEGER NOT NULL DEFAULT 8,
    "label_width_mm" DOUBLE PRECISION NOT NULL DEFAULT 62,
    "label_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 34,
    "gap_x_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "gap_y_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "padding_top_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "padding_right_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "padding_bottom_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "padding_left_mm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "barcode_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "barcode_format" TEXT NOT NULL DEFAULT 'CODE128',
    "show_product_name" BOOLEAN NOT NULL DEFAULT true,
    "show_variant_name" BOOLEAN NOT NULL DEFAULT true,
    "show_price" BOOLEAN NOT NULL DEFAULT true,
    "show_sku_code" BOOLEAN NOT NULL DEFAULT false,
    "show_barcode_number" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barcode_print_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barcode_print_jobs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "grn_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total_copies" INTEGER NOT NULL DEFAULT 0,
    "printed_count" INTEGER NOT NULL DEFAULT 0,
    "print_run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barcode_print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barcode_print_job_items" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "barcode_id" TEXT,
    "barcode_snapshot" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT,
    "sku_code_snapshot" TEXT NOT NULL,
    "price_snapshot" DECIMAL(10,2),
    "copies" INTEGER NOT NULL,
    "printed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_print_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barcode_print_templates_name_key" ON "barcode_print_templates"("name");

-- CreateIndex
CREATE INDEX "barcode_print_jobs_source_type_created_at_idx" ON "barcode_print_jobs"("source_type", "created_at");

-- CreateIndex
CREATE INDEX "barcode_print_jobs_grn_id_idx" ON "barcode_print_jobs"("grn_id");

-- CreateIndex
CREATE INDEX "barcode_print_job_items_job_id_idx" ON "barcode_print_job_items"("job_id");

-- CreateIndex
CREATE INDEX "barcode_print_job_items_sku_id_variant_id_idx" ON "barcode_print_job_items"("sku_id", "variant_id");

-- AddForeignKey
ALTER TABLE "barcode_print_templates" ADD CONSTRAINT "barcode_print_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_jobs" ADD CONSTRAINT "barcode_print_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "barcode_print_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_jobs" ADD CONSTRAINT "barcode_print_jobs_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_jobs" ADD CONSTRAINT "barcode_print_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_job_items" ADD CONSTRAINT "barcode_print_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "barcode_print_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_job_items" ADD CONSTRAINT "barcode_print_job_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_job_items" ADD CONSTRAINT "barcode_print_job_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_print_job_items" ADD CONSTRAINT "barcode_print_job_items_barcode_id_fkey" FOREIGN KEY ("barcode_id") REFERENCES "product_barcodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
