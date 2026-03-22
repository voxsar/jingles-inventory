-- Migration: Add Rack model between Floor and Shelf
-- New hierarchy: Branch → Floor → Rack → Shelf (rackId optional on Shelf for backward compat)

-- Step 1: Create the racks table
CREATE TABLE "racks" (
    "id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add rack_id (optional) to shelves for the new hierarchy
ALTER TABLE "shelves" ADD COLUMN "rack_id" TEXT;

-- Step 3: Add foreign key constraints
ALTER TABLE "racks" ADD CONSTRAINT "racks_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "racks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
