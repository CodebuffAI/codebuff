CREATE TABLE "referral_click" (
	"referral_code" text NOT NULL,
	"referrer_id" text NOT NULL,
	"device_id" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_click_referral_code_device_id_pk" PRIMARY KEY("referral_code","device_id")
);
--> statement-breakpoint
ALTER TABLE "referral_click" ADD CONSTRAINT "referral_click_referrer_id_user_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_referral_click_referrer" ON "referral_click" USING btree ("referrer_id");