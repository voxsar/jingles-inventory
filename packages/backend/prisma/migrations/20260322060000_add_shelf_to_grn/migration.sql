-- Add shelf_id to grns table
ALTER TABLE "grns" ADD COLUMN "shelf_id" TEXT;
ALTER TABLE "grns" ADD CONSTRAINT "grns_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
