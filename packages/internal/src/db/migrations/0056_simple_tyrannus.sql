CREATE TABLE "composio_session" (
	"user_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "composio_session_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "composio_session" ADD CONSTRAINT "composio_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
