-- CreateTable
CREATE TABLE "pricing_overlays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "applies_to" JSONB NOT NULL,
    "conditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_overlays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_overlays_status_idx" ON "pricing_overlays"("status");

-- CreateIndex
CREATE INDEX "pricing_overlays_priority_idx" ON "pricing_overlays"("priority");

-- CreateIndex
CREATE INDEX "pricing_overlays_valid_from_valid_to_idx" ON "pricing_overlays"("valid_from", "valid_to");
