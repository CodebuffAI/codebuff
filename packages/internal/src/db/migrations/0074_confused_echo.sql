CREATE TABLE "free_session_desktop" (
	"user_id" text NOT NULL,
	"active_instance_id" text NOT NULL,
	"status" "free_session_status" NOT NULL,
	"model" text NOT NULL,
	"premium_bucket" boolean DEFAULT false NOT NULL,
	"access_tier" "freebuff_access_tier" DEFAULT 'full' NOT NULL,
	"fireworks_route" text,
	"minimax_upstream" text,
	"country_code" text,
	"cf_country" text,
	"geoip_country" text,
	"country_block_reason" text,
	"ip_privacy_signals" text[],
	"client_ip_hash" text,
	"country_checked_at" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_session_desktop_user_id_active_instance_id_pk" PRIMARY KEY("user_id","active_instance_id")
);
--> statement-breakpoint
ALTER TABLE "free_session_desktop" ADD CONSTRAINT "free_session_desktop_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_free_session_desktop_premium_active" ON "free_session_desktop" USING btree ("user_id") WHERE "free_session_desktop"."status" = 'active' AND "free_session_desktop"."premium_bucket" = true;--> statement-breakpoint
CREATE INDEX "idx_free_session_desktop_expiry" ON "free_session_desktop" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_free_session_desktop_ip" ON "free_session_desktop" USING btree ("status","client_ip_hash");--> statement-breakpoint
CREATE INDEX "idx_free_session_desktop_user_status" ON "free_session_desktop" USING btree ("user_id","status");