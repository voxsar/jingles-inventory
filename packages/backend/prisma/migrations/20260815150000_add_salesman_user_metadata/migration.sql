ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "display_name" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "legacy_salesperson_code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_legacy_salesperson_code_key"
  ON "users"("legacy_salesperson_code");
