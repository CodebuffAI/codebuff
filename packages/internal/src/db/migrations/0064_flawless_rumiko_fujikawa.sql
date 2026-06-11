ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "client_timezone" text;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "client_tz_country" text;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "client_languages" text;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "client_hints_suspicious" boolean;