ALTER TABLE "org" RENAME COLUMN "next_quota_reset" TO "current_period_end";--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "current_period_start" timestamp with time zone;