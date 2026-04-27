ALTER TABLE "free_session" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "cf_country" text;--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "geoip_country" text;--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "country_block_reason" text;--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "ip_privacy_signals" text[];--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "client_ip_hash" text;--> statement-breakpoint
ALTER TABLE "free_session" ADD COLUMN "country_checked_at" timestamp with time zone;