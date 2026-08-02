-- Storage dimensions are canonical centimetres. Older seed/import paths wrote
-- metre values; normalize those rows once before removing runtime guessing.
UPDATE "shelves" SET
  "height" = CASE WHEN "height" <= 5 THEN "height" * 100 ELSE "height" END,
  "width" = CASE WHEN "width" <= 5 THEN "width" * 100 ELSE "width" END,
  "length" = CASE WHEN "length" <= 5 THEN "length" * 100 ELSE "length" END;

UPDATE "storage_boxes" SET
  "height" = CASE WHEN "height" <= 5 THEN "height" * 100 ELSE "height" END,
  "width" = CASE WHEN "width" <= 5 THEN "width" * 100 ELSE "width" END,
  "length" = CASE WHEN "length" <= 5 THEN "length" * 100 ELSE "length" END;

ALTER TABLE "shelves" ADD COLUMN "level_index" INTEGER;
ALTER TABLE "shelves" ADD COLUMN "elevation_cm" DOUBLE PRECISION;

ALTER TABLE "inventory_records" ADD COLUMN "pos_x" DOUBLE PRECISION;
ALTER TABLE "inventory_records" ADD COLUMN "pos_y" DOUBLE PRECISION;
ALTER TABLE "inventory_records" ADD COLUMN "pos_z" DOUBLE PRECISION;
ALTER TABLE "inventory_records" ADD COLUMN "rot_y" DOUBLE PRECISION DEFAULT 0;

-- Backfill stable shelf ordering and sensible board elevations per rack.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "rack_id" ORDER BY "created_at", "id") - 1 AS level_index
  FROM "shelves"
  WHERE "rack_id" IS NOT NULL
)
UPDATE "shelves" AS s
SET "level_index" = ranked.level_index,
    "elevation_cm" = 5 + ranked.level_index * 50
FROM ranked
WHERE s."id" = ranked."id";
