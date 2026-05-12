CREATE TABLE "free_mode_country_access_cache" (
	"user_id" text NOT NULL,
	"client_ip_hash" text NOT NULL,
	"allowed" boolean NOT NULL,
	"country_code" text,
	"cf_country" text,
	"geoip_country" text,
	"country_block_reason" text,
	"ip_privacy_signals" text[],
	"checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_mode_country_access_cache_user_id_client_ip_hash_pk" PRIMARY KEY("user_id","client_ip_hash")
);
--> statement-breakpoint
ALTER TABLE "free_mode_country_access_cache" ADD CONSTRAINT "free_mode_country_access_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_free_mode_country_cache_expires_at" ON "free_mode_country_access_cache" USING btree ("expires_at");