DO $$ BEGIN
 CREATE TYPE "public"."usageType" AS ENUM('token', 'credit');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"fingerprintId" text,
	"used" integer DEFAULT 0 NOT NULL,
	"limit" integer DEFAULT 1000000 NOT NULL,
	"usageType" "usageType" DEFAULT 'token' NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "isActive" TO "subscriptionActive";--> statement-breakpoint
DROP INDEX IF EXISTS "fingerprintId_idx";--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "usageId" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripePlanId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage" ADD CONSTRAINT "usage_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_usageId_usage_id_fk" FOREIGN KEY ("usageId") REFERENCES "public"."usage"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN IF EXISTS "fingerprintId";