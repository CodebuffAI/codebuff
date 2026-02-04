DROP INDEX "idx_credit_ledger_subscription";--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "tier" integer;--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_subscription" ON "credit_ledger" USING btree ("user_id","type","created_at");