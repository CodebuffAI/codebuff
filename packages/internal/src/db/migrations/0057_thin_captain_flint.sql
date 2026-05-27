CREATE TABLE "freebuff_daily_usage" (
	"user_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freebuff_daily_usage_user_id_usage_date_pk" PRIMARY KEY("user_id","usage_date")
);
--> statement-breakpoint
ALTER TABLE "freebuff_daily_usage" ADD CONSTRAINT "freebuff_daily_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_freebuff_daily_usage_date" ON "freebuff_daily_usage" USING btree ("usage_date");