ALTER TABLE "org_usage" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "org_usage" CASCADE;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "repo_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_org_id_idx" ON "message" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_org_id_finished_at_idx" ON "message" USING btree ("org_id","finished_at");