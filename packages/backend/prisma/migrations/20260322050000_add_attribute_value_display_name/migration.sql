-- Add display_name and represented_value columns to attribute_values
-- Migrate existing value column: use it as both display_name and represented_value

ALTER TABLE "attribute_values"
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "represented_value" TEXT;

-- Backfill from existing value column
UPDATE "attribute_values"
  SET "display_name" = "value",
      "represented_value" = "value";

-- Make columns NOT NULL now that data is backfilled
ALTER TABLE "attribute_values"
  ALTER COLUMN "display_name" SET NOT NULL,
  ALTER COLUMN "represented_value" SET NOT NULL;

-- Drop old unique constraint on (attribute_id, value) and add new one on (attribute_id, represented_value)
DROP INDEX IF EXISTS "attribute_values_attribute_id_value_key";
CREATE UNIQUE INDEX "attribute_values_attribute_id_represented_value_key"
  ON "attribute_values"("attribute_id", "represented_value");

-- Drop the old value column
ALTER TABLE "attribute_values" DROP COLUMN "value";
