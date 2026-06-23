ALTER TABLE "referral" DROP CONSTRAINT "referral_referrer_id_referred_id_pk";--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_id_referred_id_program_pk" PRIMARY KEY("referrer_id","referred_id","program");--> statement-breakpoint
ALTER TABLE "referral_qualification" ADD COLUMN "glm_bonus_consumed_at" timestamp;--> statement-breakpoint
ALTER TABLE "referral_qualification" ADD COLUMN "glm_bonus_consumed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "referral_qualification" ADD CONSTRAINT "referral_qualification_glm_bonus_consumed_by_user_id_user_id_fk" FOREIGN KEY ("glm_bonus_consumed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;