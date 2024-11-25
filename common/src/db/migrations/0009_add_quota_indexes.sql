-- Add index for the fingerprint_id foreign key in message table
CREATE INDEX IF NOT EXISTS "message_fingerprint_id_idx" ON "message" ("fingerprint_id");

-- Add index for the user_id foreign key in message table  
CREATE INDEX IF NOT EXISTS "message_user_id_idx" ON "message" ("user_id");