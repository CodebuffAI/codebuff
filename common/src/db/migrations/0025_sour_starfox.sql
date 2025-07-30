ALTER TABLE "user" DROP CONSTRAINT "user_publisher_id_publisher_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_template" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "publisher_id";