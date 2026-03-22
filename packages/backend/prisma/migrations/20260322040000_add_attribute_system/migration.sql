-- CreateTable: Global Attribute System
CREATE TABLE "attributes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dropdown',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attributes_name_key" ON "attributes"("name");

-- CreateTable: Attribute Values (for dropdown type)
CREATE TABLE "attribute_values" (
    "id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribute_values_attribute_id_value_key" ON "attribute_values"("attribute_id", "value");

-- CreateTable: SKU Attributes (which attributes are assigned to a product)
CREATE TABLE "sku_attributes" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,

    CONSTRAINT "sku_attributes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sku_attributes_sku_id_attribute_id_key" ON "sku_attributes"("sku_id", "attribute_id");

-- CreateTable: SKU Attribute Values (which values are selected per attribute per product)
CREATE TABLE "sku_attribute_values" (
    "sku_attribute_id" TEXT NOT NULL,
    "attribute_value_id" TEXT NOT NULL,

    CONSTRAINT "sku_attribute_values_pkey" PRIMARY KEY ("sku_attribute_id","attribute_value_id")
);

-- CreateTable: SKU Variants (each unique attribute combo)
CREATE TABLE "sku_variants" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "variant_code" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sku_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sku_variants_variant_code_key" ON "sku_variants"("variant_code");

-- CreateTable: SKU Variant Values (links variant to specific attribute values)
CREATE TABLE "sku_variant_values" (
    "variant_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "attribute_value_id" TEXT NOT NULL,

    CONSTRAINT "sku_variant_values_pkey" PRIMARY KEY ("variant_id","attribute_id")
);

-- AddColumn: variant_id to inventory_records (optional)
ALTER TABLE "inventory_records" ADD COLUMN "variant_id" TEXT;

-- AddColumn: variant_id to grn_lines (optional)
ALTER TABLE "grn_lines" ADD COLUMN "variant_id" TEXT;

-- AddForeignKey: attribute_values -> attributes
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_fkey"
    FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_attributes -> skus
ALTER TABLE "sku_attributes" ADD CONSTRAINT "sku_attributes_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_attributes -> attributes
ALTER TABLE "sku_attributes" ADD CONSTRAINT "sku_attributes_attribute_id_fkey"
    FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_attribute_values -> sku_attributes
ALTER TABLE "sku_attribute_values" ADD CONSTRAINT "sku_attribute_values_sku_attribute_id_fkey"
    FOREIGN KEY ("sku_attribute_id") REFERENCES "sku_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_attribute_values -> attribute_values
ALTER TABLE "sku_attribute_values" ADD CONSTRAINT "sku_attribute_values_attribute_value_id_fkey"
    FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_variants -> skus
ALTER TABLE "sku_variants" ADD CONSTRAINT "sku_variants_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_variant_values -> sku_variants
ALTER TABLE "sku_variant_values" ADD CONSTRAINT "sku_variant_values_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sku_variant_values -> attributes
ALTER TABLE "sku_variant_values" ADD CONSTRAINT "sku_variant_values_attribute_id_fkey"
    FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: sku_variant_values -> attribute_values
ALTER TABLE "sku_variant_values" ADD CONSTRAINT "sku_variant_values_attribute_value_id_fkey"
    FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: inventory_records -> sku_variants
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: grn_lines -> sku_variants
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "sku_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
