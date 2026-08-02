-- The Prisma schema declares vendor names unique; preserve that invariant in PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_name_key" ON "vendors"("name");
