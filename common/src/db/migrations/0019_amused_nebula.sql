CREATE TABLE IF NOT EXISTS "org_feature" (
	"org_id" text NOT NULL,
	"feature" text NOT NULL,
	"config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_feature_org_id_feature_pk" PRIMARY KEY("org_id","feature")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_feature" ADD CONSTRAINT "org_feature_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_feature_active" ON "org_feature" USING btree ("org_id","is_active");