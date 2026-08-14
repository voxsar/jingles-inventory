ALTER TABLE "pos_credit_payments" ADD COLUMN IF NOT EXISTS "shift_id" TEXT;

CREATE INDEX IF NOT EXISTS "pos_credit_payments_shift_created_at_idx"
  ON "pos_credit_payments"("shift_id", "created_at");
