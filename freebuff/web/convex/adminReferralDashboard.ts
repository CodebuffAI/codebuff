import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUser } from "./users";
import type { Doc } from "./_generated/dataModel";

function requireAdmin(user: Doc<"users"> | null): Doc<"users"> {
  if (!user || (user.role !== "god" && user.role !== "admin")) {
    throw new Error("Unauthorized: admin role required");
  }
  return user;
}

export const lookupReferrer = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(await getAuthUser(ctx));

    const email = args.email.trim().toLowerCase();
    if (!email) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) return null;

    const referralCodes = await ctx.db
      .query("referral_codes")
      .withIndex("by_owner", (q) => q.eq("owner", user._id))
      .collect();

    const totalReferrals = referralCodes.reduce(
      (sum, code) => sum + code.uses_count,
      0,
    );

    const spins = await ctx.db
      .query("referral_spins")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .collect();

    const referralSpins = spins.filter((s) => s.source === "referral");
    const awardedSpins = spins.filter((s) => s.status === "awarded");
    const totalSpinCredits = awardedSpins.reduce(
      (sum, s) => sum + (s.awarded_credits ?? 0),
      0,
    );

    const rewards = await ctx.db
      .query("referral_rewards")
      .withIndex("by_referrer", (q) => q.eq("referrer_user_id", user._id))
      .collect();

    const grantedRewards = rewards.filter((r) => r.status === "granted");
    const totalRewardCredits = grantedRewards.reduce(
      (sum, r) => sum + r.reward_amount,
      0,
    );

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        tier: user.tier ?? "free",
        profileImage: user.profile_image ?? null,
        joinedAt: user._creationTime,
      },
      referralCodes: referralCodes.map((c) => ({
        _id: c._id,
        code: c.code,
        active: c.active,
        usesCount: c.uses_count,
        createdAt: c.created_at,
      })),
      summary: {
        totalReferrals,
        totalReferralCodes: referralCodes.length,
        activeCodes: referralCodes.filter((c) => c.active).length,
        totalSpins: spins.length,
        referralSpins: referralSpins.length,
        awardedSpins: awardedSpins.length,
        totalSpinCredits,
        totalRewardCredits,
        totalCreditsEarned: totalSpinCredits + totalRewardCredits,
      },
    };
  },
});

export const getReferredUsersPage = query({
  args: {
    referrerUserId: v.id("users"),
    cursor: v.union(v.number(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdmin(await getAuthUser(ctx));

    const pageSize = Math.min(args.pageSize ?? 20, 50);

    const referralCodes = await ctx.db
      .query("referral_codes")
      .withIndex("by_owner", (q) => q.eq("owner", args.referrerUserId))
      .collect();

    if (referralCodes.length === 0) {
      return { users: [], nextCursor: null, hasMore: false, totalCount: 0 };
    }

    const allReferredUsers: Array<Doc<"users">> = [];
    const seenIds = new Set<string>();

    for (const code of referralCodes) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q) => q.eq("referral_code", code.code))
        .collect();

      for (const u of users) {
        if (!seenIds.has(u._id)) {
          seenIds.add(u._id);
          allReferredUsers.push(u);
        }
      }
    }

    allReferredUsers.sort((a, b) => b._creationTime - a._creationTime);

    const totalCount = allReferredUsers.length;

    let startIndex = 0;
    if (args.cursor !== null) {
      const cursorIdx = allReferredUsers.findIndex(
        (u) => u._creationTime < args.cursor!,
      );
      if (cursorIdx >= 0) {
        startIndex = cursorIdx;
      } else {
        startIndex = totalCount;
      }
    }

    const pageUsers = allReferredUsers.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < totalCount;
    const nextCursor =
      hasMore && pageUsers.length > 0
        ? pageUsers[pageUsers.length - 1]._creationTime
        : null;

    const enrichedUsers = await Promise.all(
      pageUsers.map(async (user) => {
        const [userSpins, projectMembers] = await Promise.all([
          ctx.db
            .query("referral_spins")
            .withIndex("by_user", (q) => q.eq("user", user._id))
            .collect(),
          ctx.db
            .query("project_member")
            .withIndex("by_user", (q) => q.eq("user", user._id))
            .collect(),
        ]);

        const awardedSpins = userSpins.filter((s) => s.status === "awarded");
        const totalSpinCredits = awardedSpins.reduce(
          (sum, s) => sum + (s.awarded_credits ?? 0),
          0,
        );

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          tier: user.tier ?? "free",
          profileImage: user.profile_image ?? null,
          joinedAt: user._creationTime,
          referralCodeUsed: user.referral_code ?? null,
          activity: {
            totalSpins: userSpins.length,
            awardedSpins: awardedSpins.length,
            availableSpins: userSpins.filter((s) => s.status === "available")
              .length,
            totalSpinCredits,
            projectCount: projectMembers.length,
          },
        };
      }),
    );

    return {
      users: enrichedUsers,
      nextCursor,
      hasMore,
      totalCount,
    };
  },
});

export const getReferredUserSpins = query({
  args: {
    userId: v.id("users"),
    referrerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    requireAdmin(await getAuthUser(ctx));

    const spins = await ctx.db
      .query("referral_spins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    const sorted = [...spins].sort((a, b) => b.granted_at - a.granted_at);

    return sorted.map((spin) => ({
      _id: spin._id,
      source: spin.source,
      status: spin.status,
      rewardLabel: spin.reward_label ?? null,
      awardedCredits: spin.awarded_credits ?? 0,
      grantedAt: spin.granted_at,
      spunAt: spin.spun_at ?? null,
      awardedAt: spin.awarded_at ?? null,
      referralCode: spin.referral_code ?? null,
    }));
  },
});
