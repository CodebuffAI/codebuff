CREATE TYPE "public"."grant_type" AS ENUM('free', 'referral', 'purchase', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_ledger" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"principal" integer NOT NULL,
	"balance" integer NOT NULL,
	"type" "grant_type" NOT NULL,
	"description" text,
	"priority" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_failure" (
	"message_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_count" integer DEFAULT 1 NOT NULL,
	"last_error" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_threshold" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_topup_amount" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_failure" ADD CONSTRAINT "sync_failure_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_active_balance" ON "credit_ledger" USING btree ("user_id","balance","expires_at","priority","created_at") WHERE "credit_ledger"."balance" != 0 AND "credit_ledger"."expires_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_failure_retry" ON "sync_failure" USING btree ("retry_count","last_attempt_at") WHERE "sync_failure"."retry_count" < 5;--> statement-breakpoint
ALTER TABLE "fingerprint" DROP COLUMN IF EXISTS "quota_exceeded";--> statement-breakpoint
ALTER TABLE "fingerprint" DROP COLUMN IF EXISTS "next_quota_reset";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "subscription_active";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "quota";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "quota_exceeded";