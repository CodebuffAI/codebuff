CREATE TABLE "chat_usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN "run_claimed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_usage_event" ADD CONSTRAINT "chat_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_usage_event_user_created" ON "chat_usage_event" USING btree ("user_id","created_at");