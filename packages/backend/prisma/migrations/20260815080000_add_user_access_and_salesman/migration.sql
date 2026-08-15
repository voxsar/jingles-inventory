ALTER TABLE "users"
  ADD COLUMN "access_scope" TEXT NOT NULL DEFAULT 'BOTH',
  ADD COLUMN "is_salesman" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "users"
SET "access_scope" = CASE
  WHEN "role" IN ('Admin', 'Manager') THEN 'ADMIN'
  WHEN "role" IN ('Vendor', 'Inspector') THEN 'INVENTORY'
  ELSE 'BOTH'
END,
"is_salesman" = TRUE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_access_scope_check"
  CHECK ("access_scope" IN ('CASHIER', 'INVENTORY', 'BOTH', 'ADMIN'));
