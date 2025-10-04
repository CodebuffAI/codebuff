ALTER TABLE "message" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "client_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "request" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "cache_creation_input_tokens" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "cache_creation_input_tokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "reasoning_text" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "reasoning_tokens" integer;