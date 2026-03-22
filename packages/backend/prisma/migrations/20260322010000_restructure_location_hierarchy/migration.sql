-- Migration: Restructure location hierarchy
-- Old: Branch → Location → Area → Shelf → Box
-- New: Branch → Floor → Shelf (hasFreezer, hasLock) → Box

-- Step 1: Create the new floors table (replaces locations)
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing location data into floors
-- Combine floor + section fields into the name, use first 10 chars of floor as code
INSERT INTO "floors" ("id", "branch_id", "name", "code", "notes", "is_active", "created_at")
SELECT
    "id",
    COALESCE("branch_id", (SELECT "id" FROM "branches" WHERE "is_default" = true LIMIT 1)),
    CASE
        WHEN "section" IS NOT NULL AND "section" != '' THEN "floor" || ' - ' || "section"
        ELSE "floor"
    END,
    LEFT(UPPER(REPLACE(REPLACE("floor", ' ', ''), '-', '')), 10),
    "notes",
    "is_active",
    NOW()
FROM "locations"
WHERE "branch_id" IS NOT NULL;

-- Step 3: Add floor_id column to shelves, drop area_id
ALTER TABLE "shelves" ADD COLUMN "floor_id" TEXT;

-- Migrate shelves: connect via area → location chain
UPDATE "shelves" s
SET "floor_id" = a."location_id"
FROM "areas" a
WHERE s."area_id" = a."id";

-- For shelves that couldn't be migrated (no matching area), assign to first floor
UPDATE "shelves"
SET "floor_id" = (SELECT "id" FROM "floors" LIMIT 1)
WHERE "floor_id" IS NULL;

-- Step 4: Add special shelf properties and notes, drop old columns
ALTER TABLE "shelves" ADD COLUMN "has_freezer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shelves" ADD COLUMN "has_lock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shelves" ADD COLUMN "notes" TEXT;

-- Now set floor_id NOT NULL (after data migration)
ALTER TABLE "shelves" ALTER COLUMN "floor_id" SET NOT NULL;

-- Drop old area_id column and rotation_angle
ALTER TABLE "shelves" DROP COLUMN "area_id";
ALTER TABLE "shelves" DROP COLUMN "rotation_angle";

-- Step 5: Update storage_boxes — make shelf_id required, drop area_id
-- First, assign any area-only boxes to a shelf in that area (if one exists)
UPDATE "storage_boxes" sb
SET "shelf_id" = (
    SELECT s."id" FROM "shelves" s
    WHERE s."floor_id" = (SELECT a."location_id" FROM "areas" a WHERE a."id" = sb."area_id")
    LIMIT 1
)
WHERE sb."shelf_id" IS NULL AND sb."area_id" IS NOT NULL;

-- For boxes still without a shelf, assign to first available shelf
UPDATE "storage_boxes"
SET "shelf_id" = (SELECT "id" FROM "shelves" LIMIT 1)
WHERE "shelf_id" IS NULL;

ALTER TABLE "storage_boxes" ALTER COLUMN "shelf_id" SET NOT NULL;
ALTER TABLE "storage_boxes" DROP COLUMN "area_id";

-- Step 6: Update inventory_records — rename location_id to floor_id
ALTER TABLE "inventory_records" RENAME COLUMN "location_id" TO "floor_id";

-- Step 7: Update grns — rename location_id to floor_id
ALTER TABLE "grns" RENAME COLUMN "location_id" TO "floor_id";

-- Step 8: Update stock_transfers — rename location columns to floor columns
ALTER TABLE "stock_transfers" RENAME COLUMN "from_location_id" TO "from_floor_id";
ALTER TABLE "stock_transfers" RENAME COLUMN "to_location_id" TO "to_floor_id";

-- Step 9: Add foreign key constraints
ALTER TABLE "floors" ADD CONSTRAINT "floors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storage_boxes" ADD CONSTRAINT "storage_boxes_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "grns" ADD CONSTRAINT "grns_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_floor_id_fkey" FOREIGN KEY ("from_floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_floor_id_fkey" FOREIGN KEY ("to_floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 10: Drop old tables and constraints
DROP TABLE IF EXISTS "areas";
DROP TABLE IF EXISTS "locations";
