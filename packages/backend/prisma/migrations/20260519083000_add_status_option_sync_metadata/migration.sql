ALTER TABLE "status_options"
    ADD COLUMN "server_seq" INTEGER,
    ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "status_options_server_seq_idx"
    ON "status_options"("server_seq");

CREATE INDEX "status_options_deleted_at_idx"
    ON "status_options"("deleted_at");
