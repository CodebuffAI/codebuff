CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
ALTER TYPE "public"."grant_type" ADD VALUE 'subscription' BEFORE 'purchase';--> statement-breakpoint
CREATE TABLE "limit_override" (
	"user_id" text PRIMARY KEY NOT NULL,
	"credits_per_block" integer NOT NULL,
	"block_duration_hours" integer NOT NULL,
	"weekly_credit_limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"user_id" text,
	"stripe_price_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"billing_period_start" timestamp with time zone NOT NULL,
	"billing_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "limit_override" ADD CONSTRAINT "limit_override_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscription_customer" ON "subscription" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_user" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_status" ON "subscription" USING btree ("status") WHERE "subscription"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_subscription" ON "credit_ledger" USING btree ("stripe_subscription_id","type","created_at");