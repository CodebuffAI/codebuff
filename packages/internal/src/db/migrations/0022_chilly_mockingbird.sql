CREATE TABLE IF NOT EXISTS "agent_config" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"publisher_id" text NOT NULL,
	"major" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_config"."version", '.', 1) AS INTEGER)) STORED,
	"minor" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_config"."version", '.', 2) AS INTEGER)) STORED,
	"patch" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_config"."version", '.', 3) AS INTEGER)) STORED,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_config_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publisher" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"verified" boolean DEFAULT false NOT NULL,
	"bio" text,
	"avatar_url" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_config_publisher" ON "agent_config" USING btree ("publisher_id");