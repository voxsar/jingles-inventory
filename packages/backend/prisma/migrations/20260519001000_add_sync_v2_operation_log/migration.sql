CREATE TABLE "sync_operation_log" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "op_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "base_version" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "conflict_data" JSONB,
    "last_error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "applied_server_seq" INTEGER,

    CONSTRAINT "sync_operation_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "local_payload" JSONB,
    "server_payload" JSONB,
    "resolution_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_server_sequence" (
    "seq" SERIAL NOT NULL,
    "operation_id" TEXT,
    "aggregate_type" TEXT,
    "aggregate_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_server_sequence_pkey" PRIMARY KEY ("seq")
);

CREATE TABLE "sync_server_changes" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_server_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_operation_log_idempotency_key_key"
    ON "sync_operation_log"("idempotency_key");

CREATE INDEX "sync_operation_log_status_created_at_idx"
    ON "sync_operation_log"("status", "created_at");

CREATE INDEX "sync_operation_log_client_id_created_at_idx"
    ON "sync_operation_log"("client_id", "created_at");

CREATE INDEX "sync_conflicts_client_id_status_created_at_idx"
    ON "sync_conflicts"("client_id", "status", "created_at");

CREATE INDEX "sync_conflicts_operation_id_idx"
    ON "sync_conflicts"("operation_id");

CREATE INDEX "sync_server_sequence_created_at_idx"
    ON "sync_server_sequence"("created_at");

CREATE INDEX "sync_server_changes_seq_table_name_idx"
    ON "sync_server_changes"("seq", "table_name");

CREATE INDEX "sync_server_changes_table_name_row_id_idx"
    ON "sync_server_changes"("table_name", "row_id");
