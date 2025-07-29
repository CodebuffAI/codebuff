ALTER TABLE "publisher" DROP CONSTRAINT "publisher_slug_unique";--> statement-breakpoint
ALTER TABLE "publisher" DROP COLUMN IF EXISTS "slug";--> statement-breakpoint
ALTER TABLE "publisher" ALTER COLUMN "id" DROP DEFAULT;