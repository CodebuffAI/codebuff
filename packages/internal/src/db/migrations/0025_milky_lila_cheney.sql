-- Session type simplification: from ['web', 'client', 'pat'] to ['web', 'pat', 'cli']
-- Add type column and backfill existing data based on heuristics

-- 1. Create the enum type with simplified values
CREATE TYPE "public"."session_type" AS ENUM('web', 'pat', 'cli');

-- 2. Add the column without a default (so we can backfill properly)
ALTER TABLE "session" ADD COLUMN "type" "session_type";

-- 3. Backfill existing data based on heuristics
-- First, set all sessions to 'web' as the base case
UPDATE "session" SET "type" = 'web';

-- Then identify and mark CLIs (sessions with no fingerprint_id and far-future expiration)
UPDATE "session" SET "type" = 'cli'
WHERE "fingerprint_id" IS NOT NULL
AND "expires" > NOW() + INTERVAL '1 year';

-- 4. Set the column to NOT NULL and add default for future inserts
ALTER TABLE "session" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "session" ALTER COLUMN "type" SET DEFAULT 'web';
