-- Add batch_reference_pricing column to skus table
ALTER TABLE skus ADD COLUMN batch_reference_pricing JSONB;
