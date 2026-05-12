CREATE TYPE "public"."freebuff_access_tier" AS ENUM('full', 'limited');--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "access_tier" "freebuff_access_tier" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "free_session_admit" ADD COLUMN "access_tier" "freebuff_access_tier" DEFAULT 'full' NOT NULL;