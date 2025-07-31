ALTER TABLE "publisher" DROP CONSTRAINT "publisher_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "publisher" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "created_by" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
