CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"auto_topup_enabled" boolean DEFAULT false NOT NULL,
	"auto_topup_threshold" integer DEFAULT 500,
	"auto_topup_amount" integer DEFAULT 2000,
	"credit_limit" integer,
	"billing_alerts" boolean DEFAULT true NOT NULL,
	"usage_alerts" boolean DEFAULT true NOT NULL,
	"weekly_reports" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_slug_unique" UNIQUE("slug"),
	CONSTRAINT "org_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	CONSTRAINT "org_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_member" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_member_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_repo" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"repo_url" text NOT NULL,
	"repo_name" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "repo_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org" ADD CONSTRAINT "org_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_invite" ADD CONSTRAINT "org_invite_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_invite" ADD CONSTRAINT "org_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_invite" ADD CONSTRAINT "org_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_member" ADD CONSTRAINT "org_member_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_member" ADD CONSTRAINT "org_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_repo" ADD CONSTRAINT "org_repo_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_repo" ADD CONSTRAINT "org_repo_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_invite_token" ON "org_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_invite_email" ON "org_invite" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_invite_expires" ON "org_invite" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_repo_active" ON "org_repo" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_repo_unique" ON "org_repo" USING btree ("org_id","repo_url");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_org" ON "credit_ledger" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_org_id_idx" ON "message" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_org_id_finished_at_idx" ON "message" USING btree ("org_id","finished_at");