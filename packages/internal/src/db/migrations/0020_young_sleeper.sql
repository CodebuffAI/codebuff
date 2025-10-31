CREATE TABLE IF NOT EXISTS "git_eval_results" (
	"id" text PRIMARY KEY NOT NULL,
	"cost_mode" text,
	"reasoner_model" text,
	"agent_model" text,
	"metadata" jsonb,
	"cost" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
