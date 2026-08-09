CREATE TABLE "managed_devices" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "reported_name" TEXT NOT NULL,
    "name_version" INTEGER NOT NULL DEFAULT 0,
    "application" TEXT NOT NULL,
    "application_version" TEXT NOT NULL,
    "platform" TEXT,
    "hostname" TEXT,
    "branch_id" TEXT,
    "terminal_id" TEXT,
    "last_ip" TEXT,
    "last_connection" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_devices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "managed_devices_application_last_seen_at_idx" ON "managed_devices"("application", "last_seen_at");
CREATE INDEX "managed_devices_branch_id_idx" ON "managed_devices"("branch_id");
