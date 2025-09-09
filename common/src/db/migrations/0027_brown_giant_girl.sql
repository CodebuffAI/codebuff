CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_step_status" AS ENUM('running', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"agent_id" text NOT NULL,
	"publisher_id" text GENERATED ALWAYS AS (CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '/', 1)
             ELSE NULL
           END) STORED,
	"agent_name" text GENERATED ALWAYS AS (CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(split_part(agent_id, '/', 2), '@', 1)
             ELSE agent_id
           END) STORED,
	"agent_version" text GENERATED ALWAYS AS (CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '@', 2)
             ELSE NULL
           END) STORED,
	"ancestor_run_ids" text[],
	"root_run_id" text GENERATED ALWAYS AS (CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[1] ELSE id END) STORED,
	"parent_run_id" text GENERATED ALWAYS AS (CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[array_length(ancestor_run_ids, 1)] ELSE NULL END) STORED,
	"depth" integer GENERATED ALWAYS AS (COALESCE(array_length(ancestor_run_ids, 1), 1)) STORED,
	"duration_ms" integer GENERATED ALWAYS AS (CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer) STORED,
	"total_steps" integer DEFAULT 0,
	"direct_credits" numeric(10, 6) DEFAULT '0',
	"total_credits" numeric(10, 6) DEFAULT '0',
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_step" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_run_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"duration_ms" integer GENERATED ALWAYS AS (CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer) STORED,
	"credits" numeric(10, 6) DEFAULT '0' NOT NULL,
	"child_run_ids" text[],
	"spawned_count" integer GENERATED ALWAYS AS (array_length(child_run_ids, 1)) STORED,
	"message_id" text,
	"status" "agent_step_status" DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_user_id" ON "agent_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_parent" ON "agent_run" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_root" ON "agent_run" USING btree ("root_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_agent_id" ON "agent_run" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_publisher" ON "agent_run" USING btree ("publisher_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_status" ON "agent_run" USING btree ("status") WHERE "agent_run"."status" = 'running';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_ancestors_gin" ON "agent_run" USING gin ("ancestor_run_ids");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_step_run_id" ON "agent_step" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_step_children_gin" ON "agent_step" USING gin ("child_run_ids");