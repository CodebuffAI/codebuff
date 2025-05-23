ALTER TABLE "org" ADD COLUMN "auto_topup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "auto_topup_threshold" integer DEFAULT 500;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "auto_topup_amount" integer DEFAULT 2000;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "credit_limit" integer;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "billing_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "usage_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "weekly_reports" boolean DEFAULT false NOT NULL;