ALTER TABLE "sync_failure" RENAME COLUMN "message_id" TO "id";--> statement-breakpoint
ALTER TABLE "sync_failure" DROP CONSTRAINT "sync_failure_message_id_message_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_failure" ALTER COLUMN "provider" DROP DEFAULT;