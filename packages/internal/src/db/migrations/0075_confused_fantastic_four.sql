CREATE TABLE "user_device" (
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_device_user_id_device_id_pk" PRIMARY KEY("user_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "referral_v2" ADD COLUMN "referred_ip_hash" text;--> statement-breakpoint
ALTER TABLE "referral_v2" ADD COLUMN "referred_device_id" text;--> statement-breakpoint
ALTER TABLE "referral_v2" ADD COLUMN "referrer_ip_overlap" boolean;--> statement-breakpoint
ALTER TABLE "referral_v2" ADD COLUMN "referrer_device_overlap" boolean;--> statement-breakpoint
ALTER TABLE "user_device" ADD CONSTRAINT "user_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_device_device" ON "user_device" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_referral_v2_referred_device" ON "referral_v2" USING btree ("referred_device_id");--> statement-breakpoint
CREATE INDEX "idx_referral_v2_referred_ip" ON "referral_v2" USING btree ("referred_ip_hash");