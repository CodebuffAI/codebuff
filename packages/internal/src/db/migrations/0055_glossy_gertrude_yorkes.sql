ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "scamalytics_ip_privacy_signals" text[];--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "scamalytics_status" text;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "scamalytics_score" integer;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "scamalytics_risk" text;--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD COLUMN "risk_score" integer;
