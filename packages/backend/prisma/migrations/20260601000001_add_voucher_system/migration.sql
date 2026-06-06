-- Add voucher flag to SKU table
ALTER TABLE "skus" ADD COLUMN "is_voucher" BOOLEAN DEFAULT false;
ALTER TABLE "skus" ADD COLUMN "voucher_value_type" TEXT; -- 'fixed' or 'range'
ALTER TABLE "skus" ADD COLUMN "voucher_min_value" DECIMAL(10,2);
ALTER TABLE "skus" ADD COLUMN "voucher_max_value" DECIMAL(10,2);

-- Create VoucherCode table for individual voucher instances
CREATE TABLE "voucher_codes" (
    "id" TEXT PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "sku_id" TEXT NOT NULL REFERENCES "skus"("id") ON DELETE CASCADE,
    "variant_id" TEXT REFERENCES "sku_variants"("id") ON DELETE CASCADE,
    "batch_id" TEXT REFERENCES "batches"("id") ON DELETE SET NULL,
    
    -- Value tracking
    "initial_value" DECIMAL(10,2) NOT NULL,
    "current_balance" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    
    -- Status and lifecycle
    "status" TEXT NOT NULL DEFAULT 'active', -- 'active', 'redeemed', 'expired', 'cancelled', 'suspended'
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "fully_redeemed_at" TIMESTAMP(3),
    
    -- Customer/order association
    "customer_id" TEXT,
    "order_id" TEXT,
    "purchase_reference" TEXT,
    
    -- Metadata
    "notes" TEXT,
    "created_by" TEXT REFERENCES "users"("id"),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "voucher_codes_code_idx" ON "voucher_codes"("code");
CREATE INDEX "voucher_codes_sku_variant_idx" ON "voucher_codes"("sku_id", "variant_id");
CREATE INDEX "voucher_codes_status_idx" ON "voucher_codes"("status");
CREATE INDEX "voucher_codes_expires_at_idx" ON "voucher_codes"("expires_at");

-- Create VoucherRedemption table for tracking usage
CREATE TABLE "voucher_redemptions" (
    "id" TEXT PRIMARY KEY,
    "voucher_code_id" TEXT NOT NULL REFERENCES "voucher_codes"("id") ON DELETE CASCADE,
    "code" TEXT NOT NULL,
    
    -- Redemption details
    "redeemed_amount" DECIMAL(10,2) NOT NULL,
    "balance_before" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    
    -- Transaction context
    "order_id" TEXT,
    "invoice_number" TEXT,
    "branch_id" TEXT REFERENCES "branches"("id"),
    
    -- Discount application
    "applied_to_items" JSONB, -- Array of {skuId, variantId, quantity, originalPrice, discountedPrice}
    
    -- Metadata
    "redeemed_by" TEXT REFERENCES "users"("id"),
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);

CREATE INDEX "voucher_redemptions_voucher_code_id_idx" ON "voucher_redemptions"("voucher_code_id");
CREATE INDEX "voucher_redemptions_code_idx" ON "voucher_redemptions"("code");
CREATE INDEX "voucher_redemptions_redeemed_at_idx" ON "voucher_redemptions"("redeemed_at");
CREATE INDEX "voucher_redemptions_branch_id_idx" ON "voucher_redemptions"("branch_id");

-- Create VoucherRestriction table for category/product exclusions
CREATE TABLE "voucher_restrictions" (
    "id" TEXT PRIMARY KEY,
    "sku_id" TEXT NOT NULL REFERENCES "skus"("id") ON DELETE CASCADE,
    
    -- Restriction type
    "restriction_type" TEXT NOT NULL, -- 'category_exclude', 'category_include', 'sku_exclude', 'sku_include', 'variant_exclude', 'variant_include'
    
    -- Targets (JSON arrays)
    "target_category_ids" JSONB, -- Array of category IDs
    "target_sku_ids" JSONB,      -- Array of SKU IDs
    "target_variant_ids" JSONB,  -- Array of variant IDs
    
    -- Combination rules
    "cannot_combine_with_discounts" BOOLEAN DEFAULT true,
    "cannot_combine_with_other_vouchers" BOOLEAN DEFAULT true,
    "min_purchase_amount" DECIMAL(10,2),
    "max_discount_amount" DECIMAL(10,2),
    
    -- Priority
    "priority" INTEGER DEFAULT 0,
    
    -- Metadata
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE("sku_id", "restriction_type")
);

CREATE INDEX "voucher_restrictions_sku_id_idx" ON "voucher_restrictions"("sku_id");
CREATE INDEX "voucher_restrictions_restriction_type_idx" ON "voucher_restrictions"("restriction_type");

-- Create VoucherBatch table for bulk generation tracking
CREATE TABLE "voucher_batches" (
    "id" TEXT PRIMARY KEY,
    "sku_id" TEXT NOT NULL REFERENCES "skus"("id") ON DELETE CASCADE,
    "variant_id" TEXT REFERENCES "sku_variants"("id") ON DELETE CASCADE,
    
    -- Batch details
    "batch_name" TEXT NOT NULL,
    "prefix" TEXT,
    "quantity" INTEGER NOT NULL,
    "generated_count" INTEGER DEFAULT 0,
    
    -- Default values for codes in this batch
    "default_value" DECIMAL(10,2) NOT NULL,
    "expiry_days" INTEGER, -- Days from generation until expiry
    "default_expires_at" TIMESTAMP(3),
    
    -- Status
    "status" TEXT DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
    
    -- Metadata
    "created_by" TEXT REFERENCES "users"("id"),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3)
);

CREATE INDEX "voucher_batches_sku_variant_idx" ON "voucher_batches"("sku_id", "variant_id");
CREATE INDEX "voucher_batches_status_idx" ON "voucher_batches"("status");

-- Add reference from voucher codes to batch
ALTER TABLE "voucher_codes" ADD COLUMN "voucher_batch_id" TEXT REFERENCES "voucher_batches"("id") ON DELETE SET NULL;
CREATE INDEX "voucher_codes_batch_idx" ON "voucher_codes"("voucher_batch_id");
