-- Backfill script for referral_legacy grants
-- Run this AFTER migration 0039_quiet_franklin_storm.sql has been deployed and committed
--
-- This script cannot be part of Drizzle migrations because PostgreSQL requires
-- new enum values to be committed before they can be used in subsequent statements.
--
-- Usage: Connect to your database and run this script manually after deployment
-- psql $DATABASE_URL -f scripts/backfill-referral-legacy.sql

-- Migrate existing referral grants that have an expiry date to referral_legacy type
-- (These are the recurring grants from the old referral program)
UPDATE "credit_ledger" 
SET "type" = 'referral_legacy', 
    "priority" = 30
WHERE "type" = 'referral' 
  AND "expires_at" IS NOT NULL;

-- Update priority for remaining referral grants (one-time grants) to new priority
UPDATE "credit_ledger"
SET "priority" = 50
WHERE "type" = 'referral'
  AND "expires_at" IS NULL;

-- Verify the changes
SELECT "type", COUNT(*), MIN("priority"), MAX("priority")
FROM "credit_ledger"
WHERE "type" IN ('referral', 'referral_legacy')
GROUP BY "type";
