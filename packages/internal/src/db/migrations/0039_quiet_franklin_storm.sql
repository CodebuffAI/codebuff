ALTER TYPE "public"."grant_type" ADD VALUE 'referral_legacy' BEFORE 'purchase';--> statement-breakpoint
ALTER TABLE "referral" ADD COLUMN "is_legacy" boolean DEFAULT true NOT NULL;