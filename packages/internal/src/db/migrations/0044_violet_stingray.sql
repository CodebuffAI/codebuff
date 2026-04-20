DROP INDEX "idx_free_session_queue";--> statement-breakpoint
-- Backfill any in-flight rows with the previous sole free-mode model. The
-- column is supposed to be required going forward, so we set a temporary
-- default to ride out the migration and drop it immediately after.
ALTER TABLE "free_session" ADD COLUMN "model" text NOT NULL DEFAULT 'z-ai/glm-5.1';--> statement-breakpoint
ALTER TABLE "free_session" ALTER COLUMN "model" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "idx_free_session_queue" ON "free_session" USING btree ("status","model","queued_at");