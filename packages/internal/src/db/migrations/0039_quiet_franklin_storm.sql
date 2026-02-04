ALTER TYPE "public"."grant_type" ADD VALUE 'referral_legacy' BEFORE 'purchase';--> statement-breakpoint
ALTER TABLE "referral" ADD COLUMN "is_legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: Mark all existing referrals as legacy (they were created under the old recurring program)
UPDATE "referral" SET "is_legacy" = true;--> statement-breakpoint
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