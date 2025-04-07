ALTER TYPE "public"."grant_type" ADD VALUE 'rollover';--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "quota";