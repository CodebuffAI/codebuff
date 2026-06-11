ALTER TABLE "referral" ADD COLUMN "qualified_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_referral_qualified_referrer" ON "referral" USING btree ("referrer_id","qualified_at");--> statement-breakpoint
CREATE INDEX "idx_referral_qualified_referred" ON "referral" USING btree ("referred_id","qualified_at");