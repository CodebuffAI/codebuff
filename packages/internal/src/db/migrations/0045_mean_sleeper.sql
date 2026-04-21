ALTER TABLE "ad_impression" ALTER COLUMN "payout" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_impression" ADD COLUMN "provider" text DEFAULT 'gravity' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_impression" ADD COLUMN "extra_pixels" text[];