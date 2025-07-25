CREATE TABLE IF NOT EXISTS "agent_template" (
	"id" text,
	"version" text NOT NULL,
	"publisher_id" text NOT NULL,
	"major" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_template"."version", '.', 1) AS INTEGER)) STORED,
	"minor" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_template"."version", '.', 2) AS INTEGER)) STORED,
	"patch" integer GENERATED ALWAYS AS (CAST(SPLIT_PART("agent_template"."version", '.', 3) AS INTEGER)) STORED,
	"template" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_template_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publisher" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"verified" boolean DEFAULT false NOT NULL,
	"bio" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_template" ADD CONSTRAINT "agent_template_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_template_publisher" ON "agent_template" USING btree ("publisher_id");