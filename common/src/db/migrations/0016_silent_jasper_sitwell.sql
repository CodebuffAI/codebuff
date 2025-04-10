ALTER TABLE "user" ADD COLUMN "auto_topup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_threshold" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_target_balance" integer;