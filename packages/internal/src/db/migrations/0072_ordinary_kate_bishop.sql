CREATE TABLE "referral_v2" (
	"referred_id" text PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"referred_github_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"activation_access_tier" "freebuff_access_tier",
	"revoked_at" timestamp,
	CONSTRAINT "referral_v2_referred_github_user_id_unique" UNIQUE("referred_github_user_id")
);
--> statement-breakpoint
ALTER TABLE "referral_v2" ADD CONSTRAINT "referral_v2_referred_id_user_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_v2" ADD CONSTRAINT "referral_v2_referrer_id_user_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_referral_v2_referrer" ON "referral_v2" USING btree ("referrer_id");