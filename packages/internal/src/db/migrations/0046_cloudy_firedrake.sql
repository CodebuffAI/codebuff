CREATE TABLE "free_session_admit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "free_session_admit" ADD CONSTRAINT "free_session_admit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_free_session_admit_user_model_time" ON "free_session_admit" USING btree ("user_id","model","admitted_at");