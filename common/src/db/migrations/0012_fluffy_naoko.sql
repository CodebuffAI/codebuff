CREATE TYPE "public"."api_key_type" AS ENUM('anthropic', 'gemini', 'openai');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "encrypted_api_keys" (
	"user_id" text NOT NULL,
	"type" "api_key_type" NOT NULL,
	"api_key" text NOT NULL,
	CONSTRAINT "encrypted_api_keys_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "encrypted_api_keys" ADD CONSTRAINT "encrypted_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
