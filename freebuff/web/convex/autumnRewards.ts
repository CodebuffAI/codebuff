import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { attachProduct } from "../lib/autumn-api";
import type { Doc } from "./_generated/dataModel";

// Internal action to grant referral rewards via Autumn
export const grantReferralReward = internalAction({
  args: {
    userId: v.id("users"),
    rewardId: v.id("referral_rewards"),
  },
  handler: async (ctx, args) => {
    // Get the user to reward
    const user: Doc<"users"> | null = await ctx.runQuery(internal.users.get, {
      userId: args.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const result = await attachProduct(user.clerk_id, "referral_reward");

    if (!result.success) {
      console.error("Failed to grant referral reward:", result.error);
      throw new Error(
        result.error ?? "Failed to attach referral reward product",
      );
    }

    console.log("Referral reward granted successfully");
    return { success: true, result };
  },
});
