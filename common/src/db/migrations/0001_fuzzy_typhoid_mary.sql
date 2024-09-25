ALTER TABLE "session" ADD COLUMN "fingerprintId" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "fingerprintHash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fingerprintId_idx" ON "session" USING btree ("fingerprintId");