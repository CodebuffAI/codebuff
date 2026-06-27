CREATE TYPE "public"."freebuff_streak_reward_pool" AS ENUM('premium', 'limited', 'glm');--> statement-breakpoint
CREATE TABLE "freebuff_streak_reward" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pool" "freebuff_streak_reward_pool" NOT NULL,
	"reward_key" text NOT NULL,
	"session_units" numeric(3, 1) DEFAULT '1.0' NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "freebuff_streak_reward" ADD CONSTRAINT "freebuff_streak_reward_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_freebuff_streak_reward_user_pool_key" ON "freebuff_streak_reward" USING btree ("user_id","pool","reward_key");--> statement-breakpoint
CREATE INDEX "idx_freebuff_streak_reward_user_pool_time" ON "freebuff_streak_reward" USING btree ("user_id","pool","awarded_at");