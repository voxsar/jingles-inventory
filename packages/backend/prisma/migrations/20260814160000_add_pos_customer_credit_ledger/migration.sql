CREATE TABLE IF NOT EXISTS "pos_customers" (
  "id" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'Retail',
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "credit_limit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source_device_id" TEXT,
  "source_sequence_num" INTEGER,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pos_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_credit_payments" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'CASH',
  "note" TEXT,
  "terminal_id" TEXT,
  "user_id" TEXT,
  "source_device_id" TEXT,
  "source_sequence_num" INTEGER,
  "last_vector_clock" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "pos_credit_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pos_customers_name_idx" ON "pos_customers"("name");
CREATE INDEX IF NOT EXISTS "pos_credit_payments_customer_created_at_idx"
  ON "pos_credit_payments"("customer_id", "created_at");
