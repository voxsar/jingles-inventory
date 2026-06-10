-- CreateTable
CREATE TABLE "legacy_entity_links" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_code" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'auto',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "last_applied" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legacy_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_sync_runs" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stats" JSONB,
    "error_message" TEXT,

    CONSTRAINT "legacy_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legacy_entity_links_source_type_source_id_key" ON "legacy_entity_links"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "legacy_entity_links_target_type_target_id_idx" ON "legacy_entity_links"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "legacy_sync_runs_started_at_idx" ON "legacy_sync_runs"("started_at");
