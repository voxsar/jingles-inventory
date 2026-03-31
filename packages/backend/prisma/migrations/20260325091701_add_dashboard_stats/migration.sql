-- CreateTable
CREATE TABLE "dashboard_stats" (
    "id" TEXT NOT NULL,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "shelf_ready_items" INTEGER NOT NULL DEFAULT 0,
    "damaged_items" INTEGER NOT NULL DEFAULT 0,
    "open_grns" INTEGER NOT NULL DEFAULT 0,
    "inventory_by_state" JSONB NOT NULL DEFAULT '{}',
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_stats_pkey" PRIMARY KEY ("id")
);

-- Initialize with a single row (dashboard stats will be singleton)
INSERT INTO "dashboard_stats" ("id", "total_items", "shelf_ready_items", "damaged_items", "open_grns", "inventory_by_state", "last_updated")
VALUES ('00000000-0000-0000-0000-000000000001', 0, 0, 0, 0, '{}', CURRENT_TIMESTAMP);
