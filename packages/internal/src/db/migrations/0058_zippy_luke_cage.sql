CREATE TABLE "referral_qualification" (
	"github_user_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"qualified" boolean NOT NULL,
	"reason" text,
	"github_account_created_at" timestamp,
	"oldest_public_repo_created_at" timestamp,
	"github_followers" integer,
	"github_public_repos" integer,
	"github_two_factor_enabled" boolean,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"bonus_consumed_at" timestamp,
	"bonus_consumed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "referral_qualification" ADD CONSTRAINT "referral_qualification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_qualification" ADD CONSTRAINT "referral_qualification_bonus_consumed_by_user_id_user_id_fk" FOREIGN KEY ("bonus_consumed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_referral_qualification_user" ON "referral_qualification" USING btree ("user_id");