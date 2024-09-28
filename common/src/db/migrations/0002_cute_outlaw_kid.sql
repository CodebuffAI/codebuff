CREATE TABLE IF NOT EXISTS "fingerprint" (
	"id" text PRIMARY KEY NOT NULL,
	"sig_hash" text,
	"quota_exceeded" boolean DEFAULT false NOT NULL,
	"next_quota_reset" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"fingerprint_id" text NOT NULL,
	"model" text NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "fingerprintId" TO "fingerprint_id";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "isActive" TO "subscription_active";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "stripeCustomerId" TO "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_stripeCustomerId_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "fingerprintId_idx";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quota_exceeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "next_quota_reset" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_fingerprint_id_fingerprint_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."fingerprint"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_fingerprint_id_fingerprint_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."fingerprint"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN IF EXISTS "fingerprintHash";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_stripe_customer_id_unique" UNIQUE("stripe_customer_id");