CREATE TYPE "public"."grant_type" AS ENUM('free', 'referral', 'purchase', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_grants" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"amount_remaining" integer NOT NULL,
	"type" "grant_type" NOT NULL,
	"description" text,
	"priority" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_failures" (
	"message_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_count" integer DEFAULT 1 NOT NULL,
	"last_error" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "usage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_threshold" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_amount" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_failures" ADD CONSTRAINT "sync_failures_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_grants_user_active" ON "credit_grants" USING btree ("user_id","expires_at","priority","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_failures_retry" ON "sync_failures" USING btree ("retry_count","last_attempt_at") WHERE "sync_failures"."retry_count" < 5;--> statement-breakpoint
ALTER TABLE "fingerprint" DROP COLUMN IF EXISTS "quota_exceeded";--> statement-breakpoint
ALTER TABLE "fingerprint" DROP COLUMN IF EXISTS "next_quota_reset";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "subscription_active";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "quota";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "quota_exceeded";