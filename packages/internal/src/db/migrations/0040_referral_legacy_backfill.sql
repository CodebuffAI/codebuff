-- Migrate existing referral grants that have an expiry date to referral_legacy type
-- (These are the recurring grants from the old program)
UPDATE "credit_ledger" 
SET "type" = 'referral_legacy', 
    "priority" = 30
WHERE "type" = 'referral' 
  AND "expires_at" IS NOT NULL;--> statement-breakpoint
-- Update priority for remaining referral grants (one-time grants, if any exist) to new priority
UPDATE "credit_ledger"
SET "priority" = 50
WHERE "type" = 'referral'
  AND "expires_at" IS NULL;
