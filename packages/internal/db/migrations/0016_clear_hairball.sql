DROP INDEX IF EXISTS "message_finished_at_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_finished_at_user_id_idx" ON "message" USING btree ("finished_at","user_id");