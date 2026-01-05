ALTER TYPE "public"."grant_type" ADD VALUE 'ad';--> statement-breakpoint
CREATE TABLE "ad_impression" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ad_text" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"favicon" text NOT NULL,
	"click_url" text NOT NULL,
	"imp_url" text NOT NULL,
	"payout" numeric(10, 6) NOT NULL,
	"credits_granted" integer NOT NULL,
	"grant_operation_id" text,
	"served_at" timestamp with time zone DEFAULT now() NOT NULL,
	"impression_fired_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	CONSTRAINT "ad_impression_imp_url_unique" UNIQUE("imp_url")
);
--> statement-breakpoint
ALTER TABLE "ad_impression" ADD CONSTRAINT "ad_impression_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ad_impression_user" ON "ad_impression" USING btree ("user_id","served_at");--> statement-breakpoint
CREATE INDEX "idx_ad_impression_imp_url" ON "ad_impression" USING btree ("imp_url");