ALTER TABLE "message" DROP CONSTRAINT "message_fingerprint_id_fingerprint_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "message_fingerprint_id_idx";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN IF EXISTS "fingerprint_id";