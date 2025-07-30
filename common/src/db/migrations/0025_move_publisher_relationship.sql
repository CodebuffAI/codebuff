-- Add user_id column to publisher table
ALTER TABLE "publisher" ADD COLUMN "user_id" text NOT NULL;

-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "publisher" ADD CONSTRAINT "publisher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Remove foreign key constraint from user table
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_publisher_id_publisher_id_fk";

-- Drop publisher_id column from user table
ALTER TABLE "user" DROP COLUMN IF EXISTS "publisher_id";