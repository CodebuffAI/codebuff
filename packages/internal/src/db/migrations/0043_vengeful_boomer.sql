CREATE TYPE "public"."free_session_status" AS ENUM('queued', 'active');--> statement-breakpoint
CREATE TABLE "free_session" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "free_session_status" NOT NULL,
	"active_instance_id" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "free_session" ADD CONSTRAINT "free_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_free_session_queue" ON "free_session" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "idx_free_session_expiry" ON "free_session" USING btree ("expires_at");