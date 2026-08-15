-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "access_scope" TEXT NOT NULL DEFAULT 'BOTH',
    "is_salesman" BOOLEAN NOT NULL DEFAULT true,
    "legacy_code" TEXT,
    "vendor_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "users_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vendors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "address" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Vendor',
    "website" TEXT,
    "tax_id" TEXT,
    "payment_terms" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "units_of_measure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "base_unit" TEXT,
    "conversion_factor" REAL,
    "type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "skus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "unit_of_measure_id" TEXT,
    "unit_of_measure" TEXT NOT NULL,
    "conversion_rules" TEXT,
    "dimensions" TEXT,
    "video_url" TEXT,
    "is_fragile" BOOLEAN NOT NULL DEFAULT false,
    "max_stack_height" REAL,
    "cost_price" REAL,
    "selling_price" REAL,
    "wholesale_price" REAL,
    "bulk_price" REAL,
    "margin_type" TEXT,
    "margin_value" REAL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "default_manufacturing_date" DATETIME,
    "default_expiry_date" DATETIME,
    "shelf_life_days" INTEGER,
    "batch_pricing" TEXT,
    "batch_reference_pricing" TEXT,
    "low_stock_threshold" INTEGER,
    "is_voucher" BOOLEAN NOT NULL DEFAULT false,
    "voucher_value_type" TEXT,
    "voucher_min_value" DECIMAL,
    "voucher_max_value" DECIMAL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "skus_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "skus_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "skus_unit_of_measure_id_fkey" FOREIGN KEY ("unit_of_measure_id") REFERENCES "units_of_measure" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_vendors" (
    "sku_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,

    PRIMARY KEY ("sku_id", "vendor_id"),
    CONSTRAINT "sku_vendors_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_tags" (
    "sku_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("sku_id", "tag_id"),
    CONSTRAINT "sku_tags_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "attributes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dropdown',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "attribute_values" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attribute_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "represented_value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_attributes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    CONSTRAINT "sku_attributes_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_attributes_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_attribute_values" (
    "sku_attribute_id" TEXT NOT NULL,
    "attribute_value_id" TEXT NOT NULL,

    PRIMARY KEY ("sku_attribute_id", "attribute_value_id"),
    CONSTRAINT "sku_attribute_values_sku_attribute_id_fkey" FOREIGN KEY ("sku_attribute_id") REFERENCES "sku_attributes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_attribute_values_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "variant_code" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sku_variants_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sku_variant_values" (
    "variant_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "attribute_value_id" TEXT NOT NULL,

    PRIMARY KEY ("variant_id", "attribute_id"),
    CONSTRAINT "sku_variant_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_variant_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sku_variant_values_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_images_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_barcodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "barcode" TEXT NOT NULL,
    "barcode_type" TEXT NOT NULL DEFAULT 'EAN13',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_barcodes_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_barcodes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "barcode_print_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "page_width_mm" REAL NOT NULL DEFAULT 210,
    "page_height_mm" REAL NOT NULL DEFAULT 297,
    "margin_top_mm" REAL NOT NULL DEFAULT 8,
    "margin_right_mm" REAL NOT NULL DEFAULT 8,
    "margin_bottom_mm" REAL NOT NULL DEFAULT 8,
    "margin_left_mm" REAL NOT NULL DEFAULT 8,
    "columns" INTEGER NOT NULL DEFAULT 3,
    "rows" INTEGER NOT NULL DEFAULT 8,
    "label_width_mm" REAL NOT NULL DEFAULT 62,
    "label_height_mm" REAL NOT NULL DEFAULT 34,
    "gap_x_mm" REAL NOT NULL DEFAULT 2,
    "gap_y_mm" REAL NOT NULL DEFAULT 2,
    "padding_top_mm" REAL NOT NULL DEFAULT 2,
    "padding_right_mm" REAL NOT NULL DEFAULT 2,
    "padding_bottom_mm" REAL NOT NULL DEFAULT 2,
    "padding_left_mm" REAL NOT NULL DEFAULT 2,
    "barcode_height_mm" REAL NOT NULL DEFAULT 14,
    "barcode_format" TEXT NOT NULL DEFAULT 'CODE128',
    "show_product_name" BOOLEAN NOT NULL DEFAULT true,
    "show_variant_name" BOOLEAN NOT NULL DEFAULT true,
    "show_price" BOOLEAN NOT NULL DEFAULT true,
    "show_sku_code" BOOLEAN NOT NULL DEFAULT false,
    "show_barcode_number" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "barcode_print_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "barcode_print_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "grn_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total_copies" INTEGER NOT NULL DEFAULT 0,
    "printed_count" INTEGER NOT NULL DEFAULT 0,
    "print_run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "printed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "barcode_print_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "barcode_print_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "barcode_print_jobs_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "barcode_print_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "barcode_print_job_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "barcode_id" TEXT,
    "barcode_snapshot" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT,
    "sku_code_snapshot" TEXT NOT NULL,
    "price_snapshot" DECIMAL,
    "copies" INTEGER NOT NULL,
    "printed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "barcode_print_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "barcode_print_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "barcode_print_job_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "barcode_print_job_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "barcode_print_job_items_barcode_id_fkey" FOREIGN KEY ("barcode_id") REFERENCES "product_barcodes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "floors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "length" REAL,
    "width" REAL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "racks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "floor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pos_x" REAL,
    "pos_z" REAL,
    "rot_y" REAL DEFAULT 0,
    "width_cm" REAL,
    "height_cm" REAL,
    "depth_cm" REAL,
    CONSTRAINT "racks_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "shelves" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "floor_id" TEXT NOT NULL,
    "rack_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "height" REAL NOT NULL,
    "width" REAL NOT NULL,
    "length" REAL NOT NULL,
    "level_index" INTEGER,
    "elevation_cm" REAL,
    "has_freezer" BOOLEAN NOT NULL DEFAULT false,
    "has_lock" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shelves_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shelves_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "racks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "storage_boxes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shelf_id" TEXT,
    "floor_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "height" REAL NOT NULL,
    "width" REAL NOT NULL,
    "length" REAL NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pos_x" REAL,
    "pos_y" REAL,
    "pos_z" REAL,
    "rotation_angle" REAL DEFAULT 0,
    "stack_order" INTEGER DEFAULT 0,
    "parent_box_id" TEXT,
    CONSTRAINT "storage_boxes_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "storage_boxes_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "storage_boxes_parent_box_id_fkey" FOREIGN KEY ("parent_box_id") REFERENCES "storage_boxes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "box_barcodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "box_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "barcode_type" TEXT NOT NULL DEFAULT 'EAN13',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "box_barcodes_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "storage_boxes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_transfers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference_number" TEXT NOT NULL,
    "from_branch_id" TEXT,
    "to_branch_id" TEXT,
    "from_floor_id" TEXT,
    "to_floor_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" DATETIME,
    "completed_at" DATETIME,
    CONSTRAINT "stock_transfers_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_transfers_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_transfers_from_floor_id_fkey" FOREIGN KEY ("from_floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_transfers_to_floor_id_fkey" FOREIGN KEY ("to_floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_transfers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_transfer_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transfer_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "requested_qty" INTEGER NOT NULL,
    "transferred_qty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_transfer_lines_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transfer_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_transfer_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "floor_id" TEXT,
    "shelf_id" TEXT,
    "box_id" TEXT,
    "quantity" REAL NOT NULL,
    "state" TEXT NOT NULL,
    "pos_x" REAL,
    "pos_y" REAL,
    "pos_z" REAL,
    "rot_y" REAL DEFAULT 0,
    "source_event_id" TEXT,
    "terminal_id" TEXT,
    "user_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_records_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "storage_boxes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL,
    "parent_entity_id" TEXT,
    "quantity_delta" REAL,
    "before_quantity" REAL,
    "after_quantity" REAL,
    "reason_code" TEXT,
    "user_id" TEXT,
    "terminal_id" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "override_flag" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    CONSTRAINT "inventory_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_control" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legacy_quantity_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "zeroed_at" DATETIME,
    "zeroed_by_id" TEXT,
    "zero_operation_id" TEXT,
    "records_zeroed" INTEGER NOT NULL DEFAULT 0,
    "units_zeroed" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_count_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "request_id" TEXT NOT NULL,
    "open_branch_key" TEXT,
    "started_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "stock_count_runs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_runs_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_runs_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_count_device_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "shelf_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "started_by_id" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "stock_count_device_sessions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stock_count_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_device_sessions_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_device_sessions_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_count_device_sessions_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_count_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "variant_key" TEXT NOT NULL DEFAULT '',
    "floor_id" TEXT NOT NULL,
    "shelf_id" TEXT,
    "location_key" TEXT NOT NULL,
    "inventory_record_id" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_count_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stock_count_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_count_items_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_items_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_count_items_inventory_record_id_fkey" FOREIGN KEY ("inventory_record_id") REFERENCES "inventory_records" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_count_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "last_barcode" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "counted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_count_lines_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "stock_count_device_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_count_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_lines_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_count_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "device_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "barcode" TEXT,
    "submitted_quantity" REAL NOT NULL,
    "device_before" REAL NOT NULL,
    "device_after" REAL NOT NULL,
    "total_after" REAL NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_count_submissions_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "stock_count_device_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_submissions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_count_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_submissions_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "stock_count_lines" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_count_submissions_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_count_submissions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_count_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "grns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplier_id" TEXT NOT NULL,
    "floor_id" TEXT,
    "shelf_id" TEXT,
    "invoice_reference" TEXT,
    "supplier_invoice_date" DATETIME,
    "expected_delivery_date" DATETIME,
    "delivery_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "grns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "grns_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "grns_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "grns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_number" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "sequence_number" INTEGER NOT NULL,
    "cost_price" REAL,
    "selling_price" REAL,
    "wholesale_price" REAL,
    "bulk_price" REAL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "margin_type" TEXT,
    "margin_value" REAL,
    "vendor_id" TEXT,
    "expiry_date" DATETIME,
    "manufacturing_date" DATETIME,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "batches_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "batches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pricing_overlays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "applies_to" TEXT NOT NULL,
    "conditions" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "valid_from" DATETIME,
    "valid_to" DATETIME,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "grn_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grn_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "expected_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "cost_price" REAL,
    "selling_price" REAL,
    "wholesale_price" REAL,
    "bulk_price" REAL,
    "notes" TEXT,
    CONSTRAINT "grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "grn_lines_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "grn_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "grn_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inspection_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grn_line_id" TEXT NOT NULL,
    "approved_quantity" INTEGER NOT NULL,
    "rejected_quantity" INTEGER NOT NULL,
    "damage_classification" TEXT,
    "inspector_user_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    CONSTRAINT "inspection_records_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inspection_records_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "prns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplier_id" TEXT NOT NULL,
    "inspection_record_id" TEXT,
    "floor_id" TEXT,
    "shelf_id" TEXT,
    "return_reason" TEXT,
    "expected_pickup_date" DATETIME,
    "pickup_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "prns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prns_inspection_record_id_fkey" FOREIGN KEY ("inspection_record_id") REFERENCES "inspection_records" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prns_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prns_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "prn_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prn_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "return_quantity" INTEGER NOT NULL,
    "picked_up_quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "prn_lines_prn_id_fkey" FOREIGN KEY ("prn_id") REFERENCES "prns" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prn_lines_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prn_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prn_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Processing',
    "filename" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_path" TEXT,
    "metadata" TEXT,
    "warnings" TEXT,
    "error_message" TEXT,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "selected_records" INTEGER NOT NULL DEFAULT 0,
    "approved_records" INTEGER NOT NULL DEFAULT 0,
    "rejected_records" INTEGER NOT NULL DEFAULT 0,
    "processed_at" DATETIME,
    "approved_at" DATETIME,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "import_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "source_index" INTEGER NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_status" TEXT NOT NULL DEFAULT 'Pending',
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "confidence" REAL,
    "summary" TEXT,
    "payload" TEXT NOT NULL,
    "related_records" TEXT,
    "warnings" TEXT,
    "errors" TEXT,
    "result_entity_type" TEXT,
    "result_entity_id" TEXT,
    "applied_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "import_records_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changes" TEXT,
    "ip_address" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sync_operation_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "op_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "base_version" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "conflict_data" TEXT,
    "last_error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" DATETIME,
    "applied_server_seq" INTEGER
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sync_conflicts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "local_payload" TEXT,
    "server_payload" TEXT,
    "resolution_payload" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sync_server_sequence" (
    "seq" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operation_id" TEXT,
    "aggregate_type" TEXT,
    "aggregate_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sync_server_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "status_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "special_key" TEXT,
    "server_seq" INTEGER,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "dashboard_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "total_items" REAL NOT NULL DEFAULT 0,
    "shelf_ready_items" REAL NOT NULL DEFAULT 0,
    "damaged_items" REAL NOT NULL DEFAULT 0,
    "open_grns" INTEGER NOT NULL DEFAULT 0,
    "inventory_by_state" TEXT NOT NULL DEFAULT '{}',
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "voucher_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_name" TEXT NOT NULL,
    "prefix" TEXT,
    "quantity" INTEGER NOT NULL,
    "generated_count" INTEGER NOT NULL DEFAULT 0,
    "default_value" DECIMAL NOT NULL,
    "expiry_days" INTEGER,
    "default_expires_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "voucher_batches_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "voucher_batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "voucher_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "voucher_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "voucher_batch_id" TEXT,
    "initial_value" DECIMAL NOT NULL,
    "current_balance" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    "activated_at" DATETIME,
    "fully_redeemed_at" DATETIME,
    "customer_id" TEXT,
    "order_id" TEXT,
    "purchase_reference" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voucher_codes_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "voucher_codes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "sku_variants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "voucher_codes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "voucher_codes_voucher_batch_id_fkey" FOREIGN KEY ("voucher_batch_id") REFERENCES "voucher_batches" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "voucher_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "voucher_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucher_code_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redeemed_amount" DECIMAL NOT NULL,
    "balance_before" DECIMAL NOT NULL,
    "balance_after" DECIMAL NOT NULL,
    "order_id" TEXT,
    "invoice_number" TEXT,
    "branch_id" TEXT,
    "applied_to_items" TEXT,
    "redeemed_by" TEXT,
    "redeemed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "voucher_redemptions_voucher_code_id_fkey" FOREIGN KEY ("voucher_code_id") REFERENCES "voucher_codes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "voucher_redemptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "voucher_redemptions_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_entity_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_code" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'auto',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "last_applied" TEXT,
    "last_seen_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_sync_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Running',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "stats" TEXT,
    "error_message" TEXT
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_pos_records" (
    "source_table" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "first_synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("source_table", "source_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "legacy_pos_record_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_table" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "terminal_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opening_float" REAL NOT NULL DEFAULT 0,
    "closing_float" REAL,
    "notes" TEXT,
    "opening_declaration" TEXT,
    "closing_declaration" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT true,
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "opened_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_held_sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hold_number" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "cashier_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "subtotal" REAL NOT NULL,
    "discount_total" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "notes" TEXT,
    "lines" TEXT NOT NULL DEFAULT '[]',
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receipt_number" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "shift_id" TEXT,
    "held_sale_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "subtotal" REAL NOT NULL,
    "discount_total" REAL NOT NULL DEFAULT 0,
    "tax_total" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "margin_total" REAL NOT NULL DEFAULT 0,
    "lines" TEXT NOT NULL DEFAULT '[]',
    "payments" TEXT NOT NULL DEFAULT '[]',
    "source_device_id" TEXT,
    "source_sequence_num" INTEGER,
    "synced" BOOLEAN NOT NULL DEFAULT true,
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'Retail',
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "credit_limit" REAL NOT NULL DEFAULT 0,
    "source_device_id" TEXT,
    "source_sequence_num" INTEGER,
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_credit_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "terminal_id" TEXT,
    "user_id" TEXT,
    "shift_id" TEXT,
    "source_device_id" TEXT,
    "source_sequence_num" INTEGER,
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_returns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sale_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "reason" TEXT,
    "total_refund" REAL NOT NULL,
    "lines" TEXT NOT NULL DEFAULT '[]',
    "source_device_id" TEXT,
    "source_sequence_num" INTEGER,
    "last_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_sync_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "vector_clock" TEXT NOT NULL DEFAULT '{}',
    "device_id" TEXT NOT NULL,
    "terminal_id" TEXT,
    "sequence_num" INTEGER NOT NULL,
    "lamport" INTEGER NOT NULL,
    "conflict_policy" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_sync_device_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "terminal_id" TEXT,
    "last_sequence_num" INTEGER NOT NULL DEFAULT 0,
    "vector_clock" TEXT NOT NULL DEFAULT '{}',
    "confirmed_vector_clock" TEXT NOT NULL DEFAULT '{}',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_sync_conflicts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "local_event_id" TEXT,
    "remote_event_id" TEXT,
    "policy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "managed_devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "display_name" TEXT NOT NULL,
    "reported_name" TEXT NOT NULL,
    "name_version" INTEGER NOT NULL DEFAULT 0,
    "application" TEXT NOT NULL,
    "application_version" TEXT NOT NULL,
    "platform" TEXT,
    "hostname" TEXT,
    "branch_id" TEXT,
    "terminal_id" TEXT,
    "last_ip" TEXT,
    "last_connection" TEXT,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" DATETIME,
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "voucher_restrictions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku_id" TEXT NOT NULL,
    "restriction_type" TEXT NOT NULL,
    "target_category_ids" TEXT,
    "target_sku_ids" TEXT,
    "target_variant_ids" TEXT,
    "cannot_combine_with_discounts" BOOLEAN NOT NULL DEFAULT true,
    "cannot_combine_with_other_vouchers" BOOLEAN NOT NULL DEFAULT true,
    "min_purchase_amount" DECIMAL,
    "max_discount_amount" DECIMAL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voucher_restrictions_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_legacy_code_key" ON "users"("legacy_code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "units_of_measure_name_key" ON "units_of_measure"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "skus_sku_code_key" ON "skus"("sku_code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "attributes_name_key" ON "attributes"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "attribute_values_attribute_id_represented_value_key" ON "attribute_values"("attribute_id", "represented_value");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sku_attributes_sku_id_attribute_id_key" ON "sku_attributes"("sku_id", "attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sku_variants_variant_code_key" ON "sku_variants"("variant_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_images_sku_id_variant_id_sort_order_idx" ON "product_images"("sku_id", "variant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_barcodes_barcode_key" ON "product_barcodes"("barcode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_barcodes_sku_id_variant_id_is_default_idx" ON "product_barcodes"("sku_id", "variant_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "barcode_print_templates_name_key" ON "barcode_print_templates"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "barcode_print_jobs_source_type_created_at_idx" ON "barcode_print_jobs"("source_type", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "barcode_print_jobs_grn_id_idx" ON "barcode_print_jobs"("grn_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "barcode_print_job_items_job_id_idx" ON "barcode_print_job_items"("job_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "barcode_print_job_items_sku_id_variant_id_idx" ON "barcode_print_job_items"("sku_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "floors_branch_id_code_key" ON "floors"("branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "racks_floor_id_code_key" ON "racks"("floor_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shelves_floor_id_code_key" ON "shelves"("floor_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "storage_boxes_code_key" ON "storage_boxes"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "box_barcodes_barcode_key" ON "box_barcodes"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_transfers_reference_number_key" ON "stock_transfers"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_transfer_lines_transfer_id_sku_id_variant_id_batch_id_key" ON "stock_transfer_lines"("transfer_id", "sku_id", "variant_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_runs_request_id_key" ON "stock_count_runs"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_runs_open_branch_key_key" ON "stock_count_runs"("open_branch_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_runs_branch_id_status_idx" ON "stock_count_runs"("branch_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_device_sessions_device_id_status_idx" ON "stock_count_device_sessions"("device_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_device_sessions_run_id_status_idx" ON "stock_count_device_sessions"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_device_sessions_run_id_device_id_key" ON "stock_count_device_sessions"("run_id", "device_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_items_inventory_record_id_idx" ON "stock_count_items"("inventory_record_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_items_run_id_sku_id_variant_key_location_key_key" ON "stock_count_items"("run_id", "sku_id", "variant_key", "location_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_lines_device_session_id_item_id_key" ON "stock_count_lines"("device_session_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_submissions_request_id_key" ON "stock_count_submissions"("request_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_submissions_device_session_id_created_at_idx" ON "stock_count_submissions"("device_session_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_count_submissions_item_id_created_at_idx" ON "stock_count_submissions"("item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "batches_batch_number_key" ON "batches"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "batches_sku_id_variant_id_sequence_number_key" ON "batches"("sku_id", "variant_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_overlays_name_key" ON "pricing_overlays"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_jobs_entity_type_status_idx" ON "import_jobs"("entity_type", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_jobs_created_by_created_at_idx" ON "import_jobs"("created_by", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_records_job_id_record_status_idx" ON "import_records"("job_id", "record_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_records_job_id_is_selected_idx" ON "import_records"("job_id", "is_selected");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "import_records_job_id_source_index_key" ON "import_records"("job_id", "source_index");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sync_operation_log_idempotency_key_key" ON "sync_operation_log"("idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_operation_log_status_created_at_idx" ON "sync_operation_log"("status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_operation_log_client_id_created_at_idx" ON "sync_operation_log"("client_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_conflicts_client_id_status_created_at_idx" ON "sync_conflicts"("client_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_conflicts_operation_id_idx" ON "sync_conflicts"("operation_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_server_sequence_created_at_idx" ON "sync_server_sequence"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_server_changes_seq_table_name_idx" ON "sync_server_changes"("seq", "table_name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sync_server_changes_table_name_row_id_idx" ON "sync_server_changes"("table_name", "row_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "status_options_special_key_key" ON "status_options"("special_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "status_options_server_seq_idx" ON "status_options"("server_seq");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "status_options_deleted_at_idx" ON "status_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "status_options_entity_type_value_key" ON "status_options"("entity_type", "value");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_batches_sku_variant_idx" ON "voucher_batches"("sku_id", "variant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_batches_status_idx" ON "voucher_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_codes_code_key" ON "voucher_codes"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_codes_code_idx" ON "voucher_codes"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_codes_sku_variant_idx" ON "voucher_codes"("sku_id", "variant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_codes_status_idx" ON "voucher_codes"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_codes_expires_at_idx" ON "voucher_codes"("expires_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_codes_batch_idx" ON "voucher_codes"("voucher_batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_redemptions_voucher_code_id_idx" ON "voucher_redemptions"("voucher_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_redemptions_code_idx" ON "voucher_redemptions"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_redemptions_redeemed_at_idx" ON "voucher_redemptions"("redeemed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_redemptions_branch_id_idx" ON "voucher_redemptions"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legacy_entity_links_target_type_target_id_idx" ON "legacy_entity_links"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_entity_links_source_type_source_id_key" ON "legacy_entity_links"("source_type", "source_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legacy_sync_runs_started_at_idx" ON "legacy_sync_runs"("started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legacy_pos_records_table_idx" ON "legacy_pos_records"("source_table");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_pos_record_versions_source_table_source_id_content_hash_key" ON "legacy_pos_record_versions"("source_table", "source_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_held_sales_hold_number_key" ON "pos_held_sales"("hold_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sales_receipt_number_key" ON "pos_sales"("receipt_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_customers_name_idx" ON "pos_customers"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_credit_payments_customer_created_at_idx" ON "pos_credit_payments"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_credit_payments_shift_created_at_idx" ON "pos_credit_payments"("shift_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_sync_events_aggregate_idx" ON "pos_sync_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sync_events_device_sequence_idx" ON "pos_sync_events"("device_id", "sequence_num");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sync_device_states_device_id_key" ON "pos_sync_device_states"("device_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "managed_devices_application_last_seen_at_idx" ON "managed_devices"("application", "last_seen_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "managed_devices_branch_id_idx" ON "managed_devices"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_restrictions_sku_id_idx" ON "voucher_restrictions"("sku_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_restrictions_restriction_type_idx" ON "voucher_restrictions"("restriction_type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_restrictions_sku_id_restriction_type_key" ON "voucher_restrictions"("sku_id", "restriction_type");

