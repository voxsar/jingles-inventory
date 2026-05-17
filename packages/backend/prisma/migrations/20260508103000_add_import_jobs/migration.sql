-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Processing',
    "filename" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_path" TEXT,
    "metadata" JSONB,
    "warnings" JSONB,
    "error_message" TEXT,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "selected_records" INTEGER NOT NULL DEFAULT 0,
    "approved_records" INTEGER NOT NULL DEFAULT 0,
    "rejected_records" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_records" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "source_index" INTEGER NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_status" TEXT NOT NULL DEFAULT 'Pending',
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "related_records" JSONB,
    "warnings" JSONB,
    "errors" JSONB,
    "result_entity_type" TEXT,
    "result_entity_id" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_entity_type_status_idx" ON "import_jobs"("entity_type", "status");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_created_at_idx" ON "import_jobs"("created_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_records_job_id_source_index_key" ON "import_records"("job_id", "source_index");

-- CreateIndex
CREATE INDEX "import_records_job_id_record_status_idx" ON "import_records"("job_id", "record_status");

-- CreateIndex
CREATE INDEX "import_records_job_id_is_selected_idx" ON "import_records"("job_id", "is_selected");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
