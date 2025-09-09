CREATE UNIQUE INDEX IF NOT EXISTS "unique_step_number_per_run" ON "agent_step" USING btree ("agent_run_id","step_number");--> statement-breakpoint
ALTER TABLE "publisher" ADD CONSTRAINT "publisher_single_owner" CHECK (("publisher"."user_id" IS NOT NULL AND "publisher"."org_id" IS NULL) OR
    ("publisher"."user_id" IS NULL AND "publisher"."org_id" IS NOT NULL));