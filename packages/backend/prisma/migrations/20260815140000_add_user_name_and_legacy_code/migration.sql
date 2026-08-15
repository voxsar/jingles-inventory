ALTER TABLE "users"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "legacy_code" TEXT;

CREATE UNIQUE INDEX "users_legacy_code_key" ON "users"("legacy_code");
