-- Migration: add_position_and_stacking
-- Adds 3D position/rotation to racks (stored in DB instead of localStorage)
-- Adds dimension fields to racks (physical size in cm)
-- Makes storage_boxes.shelf_id optional (boxes can be on floors directly)
-- Adds floor_id + stacking fields to storage_boxes

-- 1. Add 3D position and physical dimension fields to racks
ALTER TABLE racks
  ADD COLUMN IF NOT EXISTS pos_x         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pos_z         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS rot_y         DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width_cm      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS height_cm     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS depth_cm      DOUBLE PRECISION;

-- 2. Make shelf_id nullable on storage_boxes (boxes can sit on floors)
ALTER TABLE storage_boxes
  ALTER COLUMN shelf_id DROP NOT NULL;

-- 3. Add floor_id to storage_boxes (for floor-level boxes)
ALTER TABLE storage_boxes
  ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES floors(id);

-- 4. Add 3D position and stacking fields to storage_boxes
ALTER TABLE storage_boxes
  ADD COLUMN IF NOT EXISTS pos_x          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pos_y          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pos_z          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS rotation_angle DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stack_order    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_box_id  UUID REFERENCES storage_boxes(id);
