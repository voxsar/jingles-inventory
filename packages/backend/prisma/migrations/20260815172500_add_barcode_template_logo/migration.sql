-- AlterTable
ALTER TABLE "barcode_print_templates" ADD COLUMN "show_logo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "barcode_print_templates" ADD COLUMN "logo_url" TEXT;
