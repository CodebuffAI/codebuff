import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUser } from "./users";
import { internal } from "./_generated/api";

// Internal mutation for granting referral rewards (called from users.ts signup flow)
export const internalGrantReferralReward = internalMutation({
  args: {
    userId: v.id("users"),
    referredUserId: v.id("users"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Check if reward already exists for this referral
      const existingReward = await ctx.db
        .query("referral_rewards")
        .withIndex("by_referred_user", (q) =>
          q.eq("referred_user_id", args.referredUserId),
        )
        .unique();

      if (existingReward) {
        return {
          success: false,
          error: "Reward already granted for this referral",
        };
      }

      // Create reward record
      const rewardId = await ctx.db.insert("referral_rewards", {
        referrer_user_id: args.userId,
        referred_user_id: args.referredUserId,
        referral_code: args.referralCode,
        reward_type: "token_credits",
        reward_amount: 2000000, // 2M tokens
        granted_at: Date.now(),
        status: "pending",
      });

      // Grant the reward via Autumn
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.autumnRewards.grantReferralReward,
          {
            userId: args.userId,
            rewardId,
          },
        );

        await ctx.db.patch(rewardId, {
          status: "granted",
        });

        return {
          success: true,
          rewardId,
        };
      } catch (error) {
        console.error("Failed to grant reward via Autumn:", error);
        await ctx.db.patch(rewardId, {
          status: "failed",
        });

        return {
          success: false,
          error: "Failed to grant reward credits",
        };
      }
    } catch (error) {
      console.error("Failed to grant referral reward:", error);
      return {
        success: false,
        error: "Internal error granting reward",
      };
    }
  },
});

// Grant referral reward to a user (public mutation for manual granting if needed)
export const grantReferralReward = mutation({
  args: {
    userId: v.id("users"),
    referredUserId: v.id("users"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Check if reward already exists for this referral
      const existingReward = await ctx.db
        .query("referral_rewards")
        .withIndex("by_referred_user", (q) =>
          q.eq("referred_user_id", args.referredUserId),
        )
        .unique();

      if (existingReward) {
        return {
          success: false,
          error: "Reward already granted for this referral",
        };
      }

      // Create reward record
      const rewardId = await ctx.db.insert("referral_rewards", {
        referrer_user_id: args.userId,
        referred_user_id: args.referredUserId,
        referral_code: args.referralCode,
        reward_type: "token_credits",
        reward_amount: 2000000, // 2M tokens
        granted_at: Date.now(),
        status: "pending",
      });

      // Grant the reward via Autumn (this will be called from the signup flow)
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.autumnRewards.grantReferralReward,
          {
            userId: args.userId,
            rewardId,
          },
        );

        await ctx.db.patch(rewardId, {
          status: "granted",
        });

        return {
          success: true,
          rewardId,
        };
      } catch (error) {
        console.error("Failed to grant reward via Autumn:", error);
        await ctx.db.patch(rewardId, {
          status: "failed",
        });

        return {
          success: false,
          error: "Failed to grant reward credits",
        };
      }
    } catch (error) {
      console.error("Failed to grant referral reward:", error);
      return {
        success: false,
        error: "Internal error granting reward",
      };
    }
  },
});

// Get user's referral rewards history
export const getUserReferralRewards = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const rewards = await ctx.db
      .query("referral_rewards")
      .withIndex("by_referrer", (q) => q.eq("referrer_user_id", user._id))
      .collect();

    // Enrich with referred user info
    const enrichedRewards = await Promise.all(
      rewards.map(async (reward) => {
        const referredUser = await ctx.db.get(reward.referred_user_id);
        return {
          ...reward,
          referred_user_name: referredUser?.name,
          referred_user_email: referredUser?.email,
        };
      }),
    );

    return enrichedRewards;
  },
});

// Get referral rewards summary for billing UI
export const getReferralRewardsSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return {
        totalRewards: 0,
        totalCreditsEarned: 0,
        pendingRewards: 0,
        successfulReferrals: 0,
      };
    }

    const rewards = await ctx.db
      .query("referral_rewards")
      .withIndex("by_referrer", (q) => q.eq("referrer_user_id", user._id))
      .collect();

    const grantedRewards = rewards.filter((r) => r.status === "granted");
    const pendingRewards = rewards.filter((r) => r.status === "pending");

    return {
      totalRewards: rewards.length,
      totalCreditsEarned: grantedRewards.reduce(
        (sum, r) => sum + r.reward_amount,
        0,
      ),
      pendingRewards: pendingRewards.length,
      successfulReferrals: grantedRewards.length,
    };
  },
});
