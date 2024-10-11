DO $$ BEGIN
 CREATE TYPE "public"."referral_status" AS ENUM('pending', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral" (
	"referrer_id" text NOT NULL,
	"referred_id" text NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "referral_referrer_id_referred_id_pk" PRIMARY KEY("referrer_id","referred_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "referral_code" text DEFAULT 'ref-' || gen_random_uuid();--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_id_user_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral" ADD CONSTRAINT "referral_referred_id_user_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_referral_code_unique" UNIQUE("referral_code");