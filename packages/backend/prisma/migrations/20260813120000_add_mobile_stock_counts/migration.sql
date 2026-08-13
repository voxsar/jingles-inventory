CREATE TABLE "stock_count_runs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "request_id" TEXT NOT NULL,
    "open_branch_key" TEXT,
    "started_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "stock_count_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_device_sessions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "shelf_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "started_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "stock_count_device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "variant_key" TEXT NOT NULL DEFAULT '',
    "floor_id" TEXT NOT NULL,
    "shelf_id" TEXT,
    "location_key" TEXT NOT NULL,
    "inventory_record_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "device_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "last_barcode" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_submissions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "device_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "barcode" TEXT,
    "submitted_quantity" DOUBLE PRECISION NOT NULL,
    "device_before" DOUBLE PRECISION NOT NULL,
    "device_after" DOUBLE PRECISION NOT NULL,
    "total_after" DOUBLE PRECISION NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_count_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_count_runs_request_id_key" ON "stock_count_runs"("request_id");
CREATE UNIQUE INDEX "stock_count_runs_open_branch_key_key" ON "stock_count_runs"("open_branch_key");
CREATE INDEX "stock_count_runs_branch_id_status_idx" ON "stock_count_runs"("branch_id", "status");
CREATE UNIQUE INDEX "stock_count_device_sessions_run_id_device_id_key" ON "stock_count_device_sessions"("run_id", "device_id");
CREATE INDEX "stock_count_device_sessions_device_id_status_idx" ON "stock_count_device_sessions"("device_id", "status");
CREATE INDEX "stock_count_device_sessions_run_id_status_idx" ON "stock_count_device_sessions"("run_id", "status");
CREATE UNIQUE INDEX "stock_count_items_run_id_sku_id_variant_key_location_key_key" ON "stock_count_items"("run_id", "sku_id", "variant_key", "location_key");
CREATE INDEX "stock_count_items_inventory_record_id_idx" ON "stock_count_items"("inventory_record_id");
CREATE UNIQUE INDEX "stock_count_lines_device_session_id_item_id_key" ON "stock_count_lines"("device_session_id", "item_id");
CREATE INDEX "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");
CREATE UNIQUE INDEX "stock_count_submissions_request_id_key" ON "stock_count_submissions"("request_id");
CREATE INDEX "stock_count_submissions_device_session_id_created_at_idx" ON "stock_count_submissions"("device_session_id", "created_at");
CREATE INDEX "stock_count_submissions_item_id_created_at_idx" ON "stock_count_submissions"("item_id", "created_at");

ALTER TABLE "stock_count_runs" ADD CONSTRAINT "stock_count_runs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_runs" ADD CONSTRAINT "stock_count_runs_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_runs" ADD CONSTRAINT "stock_count_runs_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_device_sessions" ADD CONSTRAINT "stock_count_device_sessions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stock_count_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_device_sessions" ADD CONSTRAINT "stock_count_device_sessions_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_device_sessions" ADD CONSTRAINT "stock_count_device_sessions_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_device_sessions" ADD CONSTRAINT "stock_count_device_sessions_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stock_count_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_inventory_record_id_fkey" FOREIGN KEY ("inventory_record_id") REFERENCES "inventory_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "stock_count_device_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_count_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "stock_count_device_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_count_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "stock_count_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_submissions" ADD CONSTRAINT "stock_count_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
