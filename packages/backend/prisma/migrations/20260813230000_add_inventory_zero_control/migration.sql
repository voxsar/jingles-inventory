CREATE TABLE "inventory_control" (
    "id" TEXT NOT NULL,
    "legacy_quantity_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "zeroed_at" TIMESTAMP(3),
    "zeroed_by_id" TEXT,
    "zero_operation_id" TEXT,
    "records_zeroed" INTEGER NOT NULL DEFAULT 0,
    "units_zeroed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_control_pkey" PRIMARY KEY ("id")
);
