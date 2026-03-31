-- AlterTable: Add special_key to status_options
ALTER TABLE "status_options" ADD COLUMN "special_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "status_options_special_key_key" ON "status_options"("special_key");
