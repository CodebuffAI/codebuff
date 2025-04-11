CREATE TABLE IF NOT EXISTS "ft_filepicker_capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"messages" jsonb NOT NULL,
	"system" jsonb NOT NULL,
	"other" jsonb,
	"output" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ft_filepicker_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"trace_ids" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"output" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ft_filepicker_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"capture_id" uuid NOT NULL,
	"model" text NOT NULL,
	"output" text NOT NULL
);
