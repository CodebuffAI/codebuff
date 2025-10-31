ALTER TABLE "org" ALTER COLUMN "auto_topup_threshold" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "org" ALTER COLUMN "auto_topup_threshold" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ALTER COLUMN "auto_topup_amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "org" ALTER COLUMN "auto_topup_amount" SET NOT NULL;