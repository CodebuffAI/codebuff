import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUser } from "./users";
import { attachProduct, trackUsage } from "../lib/autumn-api";

const MILLION = 1_000_000;
const MAX_BOUNTY_LINKS = 10;
const MAX_EVIDENCE_LINKS = 12;
const MAX_TEXT_LENGTH = 8000;

// Mapping from credit amounts to earn reward product IDs.
// These products are free add-ons defined in autumn/config.ts that grant
// credits when attached to a customer via the Autumn SDK.
const EARN_REWARD_PRODUCTS: Record<number, string> = {
  [1 * MILLION]: "earn_reward_1m",
  [2 * MILLION]: "earn_reward_2m",
  [4 * MILLION]: "earn_reward_4m",
  [5 * MILLION]: "earn_reward_5m",
  [10 * MILLION]: "earn_reward_10m",
  [20 * MILLION]: "earn_reward_20m",
  [30 * MILLION]: "earn_reward_30m",
  [50 * MILLION]: "earn_reward_50m",
  [70 * MILLION]: "earn_reward_70m",
  [100 * MILLION]: "earn_reward_100m",
};

const EARN_REWARD_DENOMINATIONS = [
  100 * MILLION,
  70 * MILLION,
  50 * MILLION,
  30 * MILLION,
  20 * MILLION,
  10 * MILLION,
  5 * MILLION,
  4 * MILLION,
  2 * MILLION,
  1 * MILLION,
];

const VALID_BOUNTY_REWARD_AMOUNTS = new Set(EARN_REWARD_DENOMINATIONS);

function decomposeCreditsToProductIds(totalCredits: number): string[] {
  const productIds: string[] = [];
  let remaining = totalCredits;

  for (const denomination of EARN_REWARD_DENOMINATIONS) {
    while (remaining >= denomination) {
      const productId = EARN_REWARD_PRODUCTS[denomination];
      if (productId) {
        productIds.push(productId);
        remaining -= denomination;
      } else {
        break;
      }
    }
  }

  if (remaining > 0) {
    productIds.push(EARN_REWARD_PRODUCTS[1 * MILLION]);
  }

  return productIds;
}

const SPIN_REWARDS = [
  { label: "1M", credits: 1 * MILLION, weight: 0.2561 },
  { label: "2M", credits: 2 * MILLION, weight: 0.274 },
  { label: "4M", credits: 4 * MILLION, weight: 0.274 },
  { label: "10M", credits: 10 * MILLION, weight: 0.1941 },
  { label: "20M", credits: 20 * MILLION, weight: 0.001 },
  { label: "30M", credits: 30 * MILLION, weight: 0.0005 },
  { label: "70M", credits: 70 * MILLION, weight: 0.0002 },
  { label: "100M", credits: 100 * MILLION, weight: 0.0001 },
] as const;

const EXPECTED_SPIN_CREDITS = Math.round(
  SPIN_REWARDS.reduce((total, reward) => {
    return total + reward.credits * reward.weight;
  }, 0),
);

function requireUser(user: Doc<"users"> | null): Doc<"users"> {
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}

function requireAdmin(user: Doc<"users"> | null): Doc<"users"> {
  if (!user || (user.role !== "god" && user.role !== "admin")) {
    throw new Error("Unauthorized");
  }
  return user;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLinks(links: string[] | undefined, max: number): string[] {
  if (!links || links.length === 0) {
    return [];
  }

  const deduped = new Set<string>();
  for (const rawLink of links) {
    const link = rawLink.trim();
    if (!link) {
      continue;
    }
    deduped.add(link.slice(0, 2000));
    if (deduped.size >= max) {
      break;
    }
  }

  return Array.from(deduped);
}

function pickSpinReward() {
  const roll = Math.random();
  let cumulative = 0;

  for (let index = 0; index < SPIN_REWARDS.length; index += 1) {
    const reward = SPIN_REWARDS[index];
    cumulative += reward.weight;
    if (roll <= cumulative) {
      return { index, reward };
    }
  }

  return { index: 0, reward: SPIN_REWARDS[0] };
}

export const getSpinConfig = query({
  handler: async () => {
    return {
      expectedSpinCredits: EXPECTED_SPIN_CREDITS,
      rewards: SPIN_REWARDS.map((reward, index) => ({
        index,
        label: reward.label,
        credits: reward.credits,
        oddsPercent: Number((reward.weight * 100).toFixed(1)),
      })),
      legal: {
        noPurchaseNecessary: true,
      },
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = requireUser(await getAuthUser(ctx));
    void user;
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUserSpinSummary = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const [spins, referralCodes] = await Promise.all([
      ctx.db
        .query("referral_spins")
        .withIndex("by_user", (q) => q.eq("user", user._id))
        .collect(),
      ctx.db
        .query("referral_codes")
        .withIndex("by_owner", (q) => q.eq("owner", user._id))
        .collect(),
    ]);

    const availableSpins = spins.filter((spin) => spin.status === "available");
    const awardedSpins = spins.filter((spin) => spin.status === "awarded");
    const referralCreditsEarned = awardedSpins.reduce((total, spin) => {
      return total + (spin.awarded_credits ?? 0);
    }, 0);

    const referralSpinCount = spins.filter(
      (spin) => spin.source === "referral",
    ).length;

    const primaryReferralCode =
      referralCodes.find((code) => code.active) ?? referralCodes[0] ?? null;

    const referredUserIds = Array.from(
      new Set(
        spins
          .map((spin) => spin.referred_user_id)
          .filter((id): id is Id<"users"> => !!id),
      ),
    );
    const referredUsersById = new Map<Id<"users">, Doc<"users">>();

    await Promise.all(
      referredUserIds.map(async (referredUserId) => {
        const referredUser = await ctx.db.get(referredUserId);
        if (referredUser) {
          referredUsersById.set(referredUserId, referredUser);
        }
      }),
    );

    const spinHistory = [...spins]
      .sort((a, b) => b.granted_at - a.granted_at)
      .slice(0, 25)
      .map((spin) => ({
        _id: spin._id,
        source: spin.source,
        status: spin.status,
        rewardLabel: spin.reward_label,
        awardedCredits: spin.awarded_credits ?? 0,
        grantedAt: spin.granted_at,
        spunAt: spin.spun_at,
        awardedAt: spin.awarded_at,
        referredUserId: spin.referred_user_id ?? null,
        referredUserName:
          (spin.referred_user_id
            ? referredUsersById.get(spin.referred_user_id)?.name
            : null) ?? null,
        referredUserEmail:
          (spin.referred_user_id
            ? referredUsersById.get(spin.referred_user_id)?.email
            : null) ?? null,
      }));

    return {
      availableSpins: availableSpins.length,
      totalSpins: spins.length,
      successfulSpins: awardedSpins.length,
      referralSpinCount,
      referralCreditsEarned,
      referralCode: primaryReferralCode?.code ?? null,
      spinHistory,
    };
  },
});

export const ensureWelcomeSpin = mutation({
  args: {},
  handler: async (ctx) => {
    const user = requireUser(await getAuthUser(ctx));

    const existingWelcomeSpin = await ctx.db
      .query("referral_spins")
      .withIndex("by_user_and_source", (q) =>
        q.eq("user", user._id).eq("source", "welcome"),
      )
      .first();

    if (existingWelcomeSpin) {
      return { created: false, spinId: existingWelcomeSpin._id };
    }

    const spinId = await ctx.db.insert("referral_spins", {
      user: user._id,
      referred_user_id: undefined,
      referred_user_email: undefined,
      referral_code: undefined,
      source: "welcome",
      status: "available",
      awarded_credits: undefined,
      reward_label: undefined,
      granted_at: Date.now(),
      spun_at: undefined,
      awarded_at: undefined,
      revoked_at: undefined,
      revoked_reason: undefined,
    });

    return { created: true, spinId };
  },
});

export const adminGrantTestSpin = mutation({
  args: {
    userId: v.optional(v.id("users")),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));

    // Use provided userId or default to admin's own id
    const targetUserId = args.userId ?? admin._id;

    // Verify target user exists if granting to someone else
    if (args.userId) {
      const targetUser = await ctx.db.get(args.userId);
      if (!targetUser) {
        throw new Error("Target user not found");
      }
    }

    const requestedCount = args.count ?? 1;
    const count = Math.max(1, Math.min(Math.floor(requestedCount), 20));
    const now = Date.now();

    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("referral_spins", {
        user: targetUserId,
        referred_user_id: undefined,
        referred_user_email: undefined,
        referral_code: undefined,
        source: "manual",
        status: "available",
        awarded_credits: undefined,
        reward_label: undefined,
        granted_at: now + index,
        spun_at: undefined,
        awarded_at: undefined,
        revoked_at: undefined,
        revoked_reason: undefined,
      });
    }

    const availableSpins = await ctx.db
      .query("referral_spins")
      .withIndex("by_user_and_status", (q) =>
        q.eq("user", targetUserId).eq("status", "available"),
      )
      .collect();

    return {
      created: count,
      availableSpins: availableSpins.length,
    };
  },
});

export const getReferredUsers = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const referralCodes = await ctx.db
      .query("referral_codes")
      .withIndex("by_owner", (q) => q.eq("owner", user._id))
      .collect();

    if (referralCodes.length === 0) {
      return [];
    }

    const referredUsersMap = new Map<Id<"users">, Doc<"users">>();

    for (const code of referralCodes) {
      const referredUsers = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q) => q.eq("referral_code", code.code))
        .collect();

      for (const referredUser of referredUsers) {
        referredUsersMap.set(referredUser._id, referredUser);
      }
    }

    return Array.from(referredUsersMap.values())
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((referredUser) => ({
        _id: referredUser._id,
        name: referredUser.name,
        email: referredUser.email,
        profileImage: referredUser.profile_image,
        communityBadgeTier: referredUser.community_badge_tier ?? 0,
        joinedAt: referredUser._creationTime,
        referralCodeUsed: referredUser.referral_code ?? null,
      }));
  },
});

export const spinWheel = mutation({
  args: {},
  handler: async (ctx) => {
    const user = requireUser(await getAuthUser(ctx));

    const availableSpin = await ctx.db
      .query("referral_spins")
      .withIndex("by_user_and_status", (q) =>
        q.eq("user", user._id).eq("status", "available"),
      )
      .first();

    if (!availableSpin) {
      throw new Error("No spins available");
    }

    const { index, reward } = pickSpinReward();
    const now = Date.now();

    await ctx.db.patch(availableSpin._id, {
      status: "spinning",
      spun_at: now,
      awarded_credits: reward.credits,
      reward_label: reward.label,
    });

    await ctx.scheduler.runAfter(0, internal.earn.processSpinCreditGrant, {
      spinId: availableSpin._id,
    });

    const remainingSpins = await ctx.db
      .query("referral_spins")
      .withIndex("by_user_and_status", (q) =>
        q.eq("user", user._id).eq("status", "available"),
      )
      .collect();

    return {
      spinId: availableSpin._id,
      rewardIndex: index,
      rewardLabel: reward.label,
      rewardCredits: reward.credits,
      remainingSpins: remainingSpins.length,
    };
  },
});

export const getBountiesForUser = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const [bounties, submissions] = await Promise.all([
      ctx.db
        .query("bounties")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db
        .query("bounty_submissions")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .collect(),
    ]);

    const submissionByBounty = new Map<
      Id<"bounties">,
      Doc<"bounty_submissions">
    >();
    for (const submission of submissions) {
      submissionByBounty.set(submission.bounty_id, submission);
    }

    const sortedBounties = [...bounties].sort(
      (a, b) => b.updated_at - a.updated_at,
    );

    return await Promise.all(
      sortedBounties.map(async (bounty) => {
        const submission = submissionByBounty.get(bounty._id);

        const [previewImageUrl, evidenceImageUrls] = await Promise.all([
          bounty.preview_image_storage_id
            ? ctx.storage.getUrl(bounty.preview_image_storage_id)
            : Promise.resolve(null),
          submission
            ? Promise.all(
                submission.evidence_image_ids.map((storageId) =>
                  ctx.storage.getUrl(storageId),
                ),
              )
            : Promise.resolve([]),
        ]);

        const submissionStatus =
          !submission || submission.status === "draft"
            ? "incomplete"
            : submission.status;

        return {
          _id: bounty._id,
          title: bounty.title,
          description: bounty.description,
          instructions: bounty.instructions,
          evidenceRequirements: bounty.evidence_requirements,
          links: bounty.links,
          rewardCredits: bounty.reward_credits,
          previewImageUrl: previewImageUrl ?? null,
          createdAt: bounty.created_at,
          updatedAt: bounty.updated_at,
          submission: submission
            ? {
                _id: submission._id,
                status: submissionStatus,
                rawStatus: submission.status,
                evidenceText: submission.evidence_text ?? "",
                evidenceLinks: submission.evidence_links,
                evidenceImageIds: submission.evidence_image_ids,
                evidenceImageUrls: evidenceImageUrls.filter(
                  (imageUrl): imageUrl is string => !!imageUrl,
                ),
                adminReviewNote: submission.admin_review_note,
                submittedAt: submission.submitted_at,
                reviewedAt: submission.reviewed_at,
                creditStatus: submission.credit_status,
                awardedCredits: submission.credited_amount ?? 0,
              }
            : {
                _id: null,
                status: "incomplete",
                rawStatus: "draft",
                evidenceText: "",
                evidenceLinks: [],
                evidenceImageIds: [],
                evidenceImageUrls: [],
                adminReviewNote: null,
                submittedAt: null,
                reviewedAt: null,
                creditStatus: "not_granted",
                awardedCredits: 0,
              },
        };
      }),
    );
  },
});

export const submitBountySubmission = mutation({
  args: {
    bountyId: v.id("bounties"),
    evidenceText: v.optional(v.string()),
    evidenceLinks: v.optional(v.array(v.string())),
    evidenceImageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const user = requireUser(await getAuthUser(ctx));

    const bounty = await ctx.db.get(args.bountyId);
    if (!bounty || bounty.status !== "active") {
      throw new Error("Bounty is unavailable");
    }

    const evidenceText = args.evidenceText?.trim().slice(0, MAX_TEXT_LENGTH);
    const evidenceLinks = normalizeLinks(
      args.evidenceLinks,
      MAX_EVIDENCE_LINKS,
    );
    const evidenceImageIds = args.evidenceImageIds ?? [];

    if (
      !evidenceText &&
      evidenceLinks.length === 0 &&
      evidenceImageIds.length === 0
    ) {
      throw new Error("Please include text, links, or screenshots as evidence");
    }

    const existingSubmission = await ctx.db
      .query("bounty_submissions")
      .withIndex("by_user_and_bounty", (q) =>
        q.eq("user_id", user._id).eq("bounty_id", bounty._id),
      )
      .first();

    if (existingSubmission?.status === "pending") {
      throw new Error("Your submission is already pending review");
    }

    if (
      existingSubmission?.status === "approved" &&
      (existingSubmission.credit_status === "granted" ||
        existingSubmission.credit_status === "grant_pending")
    ) {
      throw new Error("This bounty is already approved for your account");
    }

    const now = Date.now();

    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        evidence_text: evidenceText,
        evidence_links: evidenceLinks,
        evidence_image_ids: evidenceImageIds,
        status: "pending",
        admin_review_note: undefined,
        reviewed_by: undefined,
        reviewed_at: undefined,
        submitted_at: now,
        credit_status: "not_granted",
        credited_amount: undefined,
        credit_awarded_at: undefined,
        credit_revoked_at: undefined,
        updated_at: now,
      });

      return {
        submissionId: existingSubmission._id,
        status: "pending",
      };
    }

    const submissionId = await ctx.db.insert("bounty_submissions", {
      bounty_id: bounty._id,
      user_id: user._id,
      evidence_text: evidenceText,
      evidence_links: evidenceLinks,
      evidence_image_ids: evidenceImageIds,
      status: "pending",
      admin_review_note: undefined,
      reviewed_by: undefined,
      submitted_at: now,
      reviewed_at: undefined,
      credit_status: "not_granted",
      credited_amount: undefined,
      credit_awarded_at: undefined,
      credit_revoked_at: undefined,
      created_at: now,
      updated_at: now,
    });

    return {
      submissionId,
      status: "pending",
    };
  },
});

export const getEarnLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getAuthUser(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 10, 5000));

    const [referralCodes, awardedSpins, grantedSubmissions] = await Promise.all(
      [
        ctx.db.query("referral_codes").collect(),
        ctx.db
          .query("referral_spins")
          .withIndex("by_status", (q) => q.eq("status", "awarded"))
          .collect(),
        ctx.db
          .query("bounty_submissions")
          .withIndex("by_credit_status", (q) =>
            q.eq("credit_status", "granted"),
          )
          .collect(),
      ],
    );

    const referralCreditsByUser = new Map<Id<"users">, number>();
    for (const spin of awardedSpins) {
      referralCreditsByUser.set(
        spin.user,
        (referralCreditsByUser.get(spin.user) ?? 0) +
          (spin.awarded_credits ?? 0),
      );
    }

    const referralsCountByUser = new Map<Id<"users">, number>();
    for (const code of referralCodes) {
      if (!code.uses_count) {
        continue;
      }

      referralsCountByUser.set(
        code.owner,
        (referralsCountByUser.get(code.owner) ?? 0) + code.uses_count,
      );
    }

    const bountyIdsNeedingLookup = Array.from(
      new Set(
        grantedSubmissions
          .filter((submission) => submission.credited_amount === undefined)
          .map((submission) => submission.bounty_id),
      ),
    );
    const lookedUpBounties = await Promise.all(
      bountyIdsNeedingLookup.map((bountyId) => ctx.db.get(bountyId)),
    );
    const bountyById = new Map(
      lookedUpBounties
        .filter((bounty): bounty is Doc<"bounties"> => !!bounty)
        .map((bounty) => [bounty._id, bounty]),
    );

    const bountyCreditsByUser = new Map<Id<"users">, number>();
    for (const submission of grantedSubmissions) {
      const rewardCredits =
        submission.credited_amount ??
        bountyById.get(submission.bounty_id)?.reward_credits ??
        0;

      if (rewardCredits <= 0) {
        continue;
      }

      bountyCreditsByUser.set(
        submission.user_id,
        (bountyCreditsByUser.get(submission.user_id) ?? 0) + rewardCredits,
      );
    }

    const participantIds = new Set<Id<"users">>([
      ...referralCreditsByUser.keys(),
      ...referralsCountByUser.keys(),
      ...bountyCreditsByUser.keys(),
    ]);

    const rankedRows = Array.from(participantIds)
      .map((userId) => {
        const bountyCredits = bountyCreditsByUser.get(userId) ?? 0;
        const referralCredits = referralCreditsByUser.get(userId) ?? 0;
        const referralsCount = referralsCountByUser.get(userId) ?? 0;
        const totalCredits = bountyCredits + referralCredits;

        return {
          userId,
          bountyCredits,
          referralCredits,
          totalCredits,
          referralsCount,
        };
      })
      .filter((row) => row.totalCredits > 0 || row.referralsCount > 0)
      .sort((a, b) => {
        if (b.totalCredits !== a.totalCredits) {
          return b.totalCredits - a.totalCredits;
        }
        if (b.referralsCount !== a.referralsCount) {
          return b.referralsCount - a.referralsCount;
        }
        return a.userId.localeCompare(b.userId);
      });

    const hasMore = rankedRows.length > limit;
    const topRows = rankedRows.slice(0, limit);

    const userIdsToFetch = Array.from(
      new Set([
        ...topRows.map((row) => row.userId),
        ...(viewer ? [viewer._id] : []),
      ]),
    );

    const users = await Promise.all(
      userIdsToFetch.map((userId) => ctx.db.get(userId)),
    );
    const usersById = new Map(
      users
        .filter((user): user is Doc<"users"> => !!user)
        .map((user) => [user._id, user]),
    );

    const communityProfiles = await Promise.all(
      topRows.map((row) =>
        ctx.db
          .query("community_profiles")
          .withIndex("by_user", (q) => q.eq("userId", row.userId))
          .unique(),
      ),
    );
    const profilesByUserId = new Map(
      communityProfiles
        .filter((p): p is Doc<"community_profiles"> => !!p)
        .map((p) => [p.userId, p]),
    );

    let viewerFollows: Set<Id<"users">> | null = null;
    if (viewer) {
      const follows = await ctx.db
        .query("community_follows")
        .withIndex("by_follower", (q) => q.eq("followerId", viewer._id))
        .collect();
      viewerFollows = new Set(follows.map((f) => f.followingId));
    }

    const entries = topRows.map((row, index) => {
      const user = usersById.get(row.userId);
      const profile = profilesByUserId.get(row.userId);
      return {
        userId: row.userId,
        rank: index + 1,
        name: user?.name ?? "Unknown user",
        profileImage: user?.profile_image ?? null,
        communityBadgeTier: user?.community_badge_tier ?? 0,
        bountyCredits: row.bountyCredits,
        referralCredits: row.referralCredits,
        totalCredits: row.totalCredits,
        referralsCount: row.referralsCount,
        followersCount: profile?.followersCount ?? 0,
        isFollowing: viewerFollows?.has(row.userId) ?? false,
        isViewer: viewer?._id === row.userId,
      };
    });

    let viewerPosition: (typeof entries)[number] | null = null;
    if (viewer) {
      const viewerRow = rankedRows.find((row) => row.userId === viewer._id);
      if (viewerRow) {
        const viewerProfile = profilesByUserId.get(viewer._id);
        viewerPosition = {
          userId: viewer._id,
          rank: rankedRows.findIndex((row) => row.userId === viewer._id) + 1,
          name: viewer.name,
          profileImage: viewer.profile_image ?? null,
          communityBadgeTier: viewer.community_badge_tier ?? 0,
          bountyCredits: viewerRow.bountyCredits,
          referralCredits: viewerRow.referralCredits,
          totalCredits: viewerRow.totalCredits,
          referralsCount: viewerRow.referralsCount,
          followersCount: viewerProfile?.followersCount ?? 0,
          isFollowing: false,
          isViewer: true,
        };
      }
    }

    return {
      entries,
      hasMore,
      viewerPosition,
    };
  },
});

export const getEarnCreditActivity = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const [spins, submissions] = await Promise.all([
      ctx.db
        .query("referral_spins")
        .withIndex("by_user", (q) => q.eq("user", user._id))
        .collect(),
      ctx.db
        .query("bounty_submissions")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .collect(),
    ]);

    const bountyIds = Array.from(
      new Set(submissions.map((submission) => submission.bounty_id)),
    );
    const bounties = await Promise.all(
      bountyIds.map((bountyId) => ctx.db.get(bountyId)),
    );
    const bountyById = new Map(
      bounties
        .filter((bounty): bounty is Doc<"bounties"> => !!bounty)
        .map((bounty) => [bounty._id, bounty]),
    );

    const events: Array<{
      id: string;
      timestamp: number;
      amount: number;
      featureId: "agent_credits";
      source: "bounty" | "referral_spin";
      title: string;
      subtitle: string;
    }> = [];

    for (const submission of submissions) {
      if (
        submission.credit_status !== "granted" ||
        !submission.credit_awarded_at
      ) {
        continue;
      }

      const bounty = bountyById.get(submission.bounty_id);
      const amount = submission.credited_amount ?? bounty?.reward_credits ?? 0;

      if (amount <= 0) {
        continue;
      }

      events.push({
        id: `bounty-${submission._id}`,
        timestamp: submission.credit_awarded_at,
        amount,
        featureId: "agent_credits",
        source: "bounty",
        title: "Bounty Approved",
        subtitle: bounty?.title ?? "Community bounty",
      });
    }

    for (const spin of spins) {
      if (
        spin.status !== "awarded" ||
        !spin.awarded_at ||
        !spin.awarded_credits
      ) {
        continue;
      }

      events.push({
        id: `spin-${spin._id}`,
        timestamp: spin.awarded_at,
        amount: spin.awarded_credits,
        featureId: "agent_credits",
        source: "referral_spin",
        title: "Referral Spin Award",
        subtitle:
          spin.source === "welcome"
            ? "Welcome spin reward"
            : "Referral spin reward",
      });
    }

    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 120);
  },
});

export const getAdminBounties = query({
  handler: async (ctx) => {
    const admin = requireAdmin(await getAuthUser(ctx));
    void admin;

    const [bounties, submissions] = await Promise.all([
      ctx.db.query("bounties").collect(),
      ctx.db.query("bounty_submissions").collect(),
    ]);

    const statsByBounty = new Map<
      Id<"bounties">,
      {
        pending: number;
        approved: number;
        rejected: number;
        revoked: number;
      }
    >();

    for (const submission of submissions) {
      const current = statsByBounty.get(submission.bounty_id) ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
        revoked: 0,
      };

      if (submission.status === "pending") {
        current.pending += 1;
      } else if (submission.status === "approved") {
        current.approved += 1;
      } else if (submission.status === "rejected") {
        current.rejected += 1;
      } else if (submission.status === "revoked") {
        current.revoked += 1;
      }

      statsByBounty.set(submission.bounty_id, current);
    }

    const sortedBounties = [...bounties].sort(
      (a, b) => b.created_at - a.created_at,
    );

    return await Promise.all(
      sortedBounties.map(async (bounty) => {
        const previewImageUrl = bounty.preview_image_storage_id
          ? await ctx.storage.getUrl(bounty.preview_image_storage_id)
          : null;

        return {
          _id: bounty._id,
          title: bounty.title,
          description: bounty.description,
          instructions: bounty.instructions,
          evidenceRequirements: bounty.evidence_requirements,
          links: bounty.links,
          status: bounty.status,
          rewardCredits: bounty.reward_credits,
          previewImageUrl,
          createdAt: bounty.created_at,
          updatedAt: bounty.updated_at,
          stats: statsByBounty.get(bounty._id) ?? {
            pending: 0,
            approved: 0,
            rejected: 0,
            revoked: 0,
          },
        };
      }),
    );
  },
});

export const createBounty = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    instructions: v.string(),
    evidenceRequirements: v.string(),
    rewardCredits: v.number(),
    links: v.optional(v.array(v.string())),
    previewImageId: v.optional(v.id("_storage")),
    status: v.optional(
      v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));

    const now = Date.now();
    const title = args.title.trim().slice(0, 140);
    const description = args.description.trim().slice(0, MAX_TEXT_LENGTH);
    const instructions = args.instructions.trim().slice(0, MAX_TEXT_LENGTH);
    const evidenceRequirements = args.evidenceRequirements
      .trim()
      .slice(0, MAX_TEXT_LENGTH);

    if (!title || !description || !instructions || !evidenceRequirements) {
      throw new Error(
        "Title, description, instructions, and evidence are required",
      );
    }

    if (args.rewardCredits <= 0) {
      throw new Error("Reward credits must be greater than 0");
    }

    if (!VALID_BOUNTY_REWARD_AMOUNTS.has(args.rewardCredits)) {
      throw new Error(
        "Reward credits must be one of the preset amounts (1M, 2M, 4M, 5M, 10M, 20M, 30M, 50M, 70M, or 100M)",
      );
    }

    const bountyId = await ctx.db.insert("bounties", {
      title,
      description,
      instructions,
      evidence_requirements: evidenceRequirements,
      links: normalizeLinks(args.links, MAX_BOUNTY_LINKS),
      reward_credits: Math.round(args.rewardCredits),
      preview_image_storage_id: args.previewImageId,
      status: args.status ?? "active",
      created_by: admin._id,
      updated_by: admin._id,
      created_at: now,
      updated_at: now,
      archived_at: args.status === "archived" ? now : undefined,
    });

    return { bountyId };
  },
});

export const updateBounty = mutation({
  args: {
    bountyId: v.id("bounties"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    evidenceRequirements: v.optional(v.string()),
    rewardCredits: v.optional(v.number()),
    links: v.optional(v.array(v.string())),
    previewImageId: v.optional(v.union(v.id("_storage"), v.null())),
    status: v.optional(
      v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));

    const bounty = await ctx.db.get(args.bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }

    const now = Date.now();

    const patch: Partial<Doc<"bounties">> = {
      updated_by: admin._id,
      updated_at: now,
    };

    if (args.title !== undefined) {
      patch.title = args.title.trim().slice(0, 140);
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim().slice(0, MAX_TEXT_LENGTH);
    }

    if (args.instructions !== undefined) {
      patch.instructions = args.instructions.trim().slice(0, MAX_TEXT_LENGTH);
    }

    if (args.evidenceRequirements !== undefined) {
      patch.evidence_requirements = args.evidenceRequirements
        .trim()
        .slice(0, MAX_TEXT_LENGTH);
    }

    if (args.rewardCredits !== undefined) {
      if (args.rewardCredits <= 0) {
        throw new Error("Reward credits must be greater than 0");
      }
      if (!VALID_BOUNTY_REWARD_AMOUNTS.has(args.rewardCredits)) {
        throw new Error(
          "Reward credits must be one of the preset amounts (1M, 2M, 4M, 5M, 10M, 20M, 30M, 50M, 70M, or 100M)",
        );
      }
      patch.reward_credits = Math.round(args.rewardCredits);
    }

    if (args.links !== undefined) {
      patch.links = normalizeLinks(args.links, MAX_BOUNTY_LINKS);
    }

    if (args.previewImageId !== undefined) {
      patch.preview_image_storage_id = args.previewImageId ?? undefined;
    }

    if (args.status !== undefined) {
      patch.status = args.status;
      patch.archived_at = args.status === "archived" ? now : undefined;
    }

    await ctx.db.patch(args.bountyId, patch);

    return { success: true };
  },
});

export const deleteBounty = mutation({
  args: {
    bountyId: v.id("bounties"),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));

    const bounty = await ctx.db.get(args.bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }

    await ctx.db.patch(args.bountyId, {
      status: "archived",
      archived_at: Date.now(),
      updated_at: Date.now(),
      updated_by: admin._id,
    });

    return { success: true };
  },
});

export const getAdminBountySubmissions = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("revoked"),
      ),
    ),
    bountyId: v.optional(v.id("bounties")),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));
    void admin;

    const rawSubmissions = args.status
      ? await ctx.db
          .query("bounty_submissions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("bounty_submissions").collect();

    const submissions = args.bountyId
      ? rawSubmissions.filter(
          (submission) => submission.bounty_id === args.bountyId,
        )
      : rawSubmissions;

    const sortedSubmissions = [...submissions].sort(
      (a, b) => b.updated_at - a.updated_at,
    );

    return await Promise.all(
      sortedSubmissions.map(async (submission) => {
        const [user, bounty, evidenceImageUrls] = await Promise.all([
          ctx.db.get(submission.user_id),
          ctx.db.get(submission.bounty_id),
          Promise.all(
            submission.evidence_image_ids.map((storageId) =>
              ctx.storage.getUrl(storageId),
            ),
          ),
        ]);

        return {
          _id: submission._id,
          status: submission.status,
          evidenceText: submission.evidence_text,
          evidenceLinks: submission.evidence_links,
          evidenceImageIds: submission.evidence_image_ids,
          evidenceImageUrls: evidenceImageUrls.filter(
            (imageUrl): imageUrl is string => !!imageUrl,
          ),
          adminReviewNote: submission.admin_review_note,
          submittedAt: submission.submitted_at,
          reviewedAt: submission.reviewed_at,
          creditStatus: submission.credit_status,
          awardedCredits: submission.credited_amount ?? 0,
          user: user
            ? {
                _id: user._id,
                name: user.name,
                email: user.email,
                profileImage: user.profile_image,
                communityBadgeTier: user.community_badge_tier ?? 0,
              }
            : null,
          bounty: bounty
            ? {
                _id: bounty._id,
                title: bounty.title,
                rewardCredits: bounty.reward_credits,
              }
            : null,
        };
      }),
    );
  },
});

export const reviewBountySubmission = mutation({
  args: {
    submissionId: v.id("bounty_submissions"),
    action: v.union(
      v.literal("approve"),
      v.literal("reject"),
      v.literal("revoke"),
    ),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = requireAdmin(await getAuthUser(ctx));

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new Error("Submission not found");
    }

    const now = Date.now();
    const adminReviewNote = args.adminNote?.trim().slice(0, 2000);

    if (args.action === "approve") {
      if (
        submission.status === "approved" &&
        (submission.credit_status === "grant_pending" ||
          submission.credit_status === "granted")
      ) {
        return { status: "already_approved" as const };
      }

      await ctx.db.patch(submission._id, {
        status: "approved",
        admin_review_note: adminReviewNote,
        reviewed_by: admin._id,
        reviewed_at: now,
        credit_status: "grant_pending",
        updated_at: now,
      });

      await ctx.scheduler.runAfter(0, internal.earn.processBountyCreditGrant, {
        submissionId: submission._id,
      });

      return { status: "approved" as const };
    }

    if (args.action === "reject") {
      if (submission.credit_status === "grant_pending") {
        throw new Error(
          "Credit grant is currently processing. Try again shortly.",
        );
      }

      if (submission.credit_status === "granted") {
        throw new Error(
          "Submission already granted credits. Use revoke instead.",
        );
      }

      await ctx.db.patch(submission._id, {
        status: "rejected",
        admin_review_note: adminReviewNote,
        reviewed_by: admin._id,
        reviewed_at: now,
        credit_status: "not_granted",
        credited_amount: undefined,
        credit_awarded_at: undefined,
        updated_at: now,
      });

      const [bounty, user] = await Promise.all([
        ctx.db.get(submission.bounty_id),
        ctx.db.get(submission.user_id),
      ]);
      if (user?.email && bounty) {
        await ctx.scheduler.runAfter(
          0,
          internal.email.sendBountySubmissionResultEmail,
          {
            recipientEmail: user.email,
            recipientName: user.name ?? "there",
            bountyTitle: bounty.title,
            approved: false,
            rewardAmount: 0,
          },
        );
      }

      return { status: "rejected" as const };
    }

    if (submission.credit_status !== "granted") {
      throw new Error("Only credited submissions can be revoked.");
    }

    await ctx.db.patch(submission._id, {
      status: "revoked",
      admin_review_note: adminReviewNote,
      reviewed_by: admin._id,
      reviewed_at: now,
      credit_status: "revoke_pending",
      updated_at: now,
    });

    await ctx.scheduler.runAfter(0, internal.earn.processBountyCreditRevoke, {
      submissionId: submission._id,
    });

    return { status: "revoke_pending" as const };
  },
});

export const internalGrantWelcomeSpin = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existingWelcomeSpin = await ctx.db
      .query("referral_spins")
      .withIndex("by_user_and_source", (q) =>
        q.eq("user", args.userId).eq("source", "welcome"),
      )
      .first();

    if (existingWelcomeSpin) {
      return { created: false, spinId: existingWelcomeSpin._id };
    }

    const spinId = await ctx.db.insert("referral_spins", {
      user: args.userId,
      referred_user_id: undefined,
      referred_user_email: undefined,
      referral_code: undefined,
      source: "welcome",
      status: "available",
      awarded_credits: undefined,
      reward_label: undefined,
      granted_at: Date.now(),
      spun_at: undefined,
      awarded_at: undefined,
      revoked_at: undefined,
      revoked_reason: undefined,
    });

    return { created: true, spinId };
  },
});

export const internalGrantReferralSpin = internalMutation({
  args: {
    userId: v.id("users"),
    referredUserId: v.id("users"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.userId === args.referredUserId) {
      return { created: false, reason: "self_referral" as const };
    }

    const referredUser = await ctx.db.get(args.referredUserId);
    if (!referredUser) {
      return { created: false, reason: "missing_referred_user" as const };
    }

    const normalizedReferredEmail = normalizeEmail(referredUser.email);
    const existingSpinForEmail = await ctx.db
      .query("referral_spins")
      .withIndex("by_referred_email", (q) =>
        q.eq("referred_user_email", normalizedReferredEmail),
      )
      .first();

    if (existingSpinForEmail) {
      return {
        created: false,
        spinId: existingSpinForEmail._id,
        reason: "duplicate_referred_email" as const,
      };
    }

    // Fallback for legacy rows created before referred_user_email existed.
    const usersWithSameEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedReferredEmail))
      .collect();

    const referredUserIds = new Set<Id<"users">>([args.referredUserId]);
    for (const user of usersWithSameEmail) {
      referredUserIds.add(user._id);
    }

    if (referredUser.email !== normalizedReferredEmail) {
      const rawEmailMatches = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", referredUser.email))
        .collect();
      for (const user of rawEmailMatches) {
        referredUserIds.add(user._id);
      }
    }

    const existingLegacySpins = await Promise.all(
      Array.from(referredUserIds).map((referredUserId) =>
        ctx.db
          .query("referral_spins")
          .withIndex("by_referred_user", (q) =>
            q.eq("referred_user_id", referredUserId),
          )
          .first(),
      ),
    );
    const existingLegacySpinForEmail = existingLegacySpins.find(
      (spin) => spin !== null,
    );
    if (existingLegacySpinForEmail) {
      return {
        created: false,
        spinId: existingLegacySpinForEmail._id,
        reason: "duplicate_referred_email" as const,
      };
    }

    const spinId = await ctx.db.insert("referral_spins", {
      user: args.userId,
      referred_user_id: args.referredUserId,
      referred_user_email: normalizedReferredEmail,
      referral_code: args.referralCode,
      source: "referral",
      status: "available",
      awarded_credits: undefined,
      reward_label: undefined,
      granted_at: Date.now(),
      spun_at: undefined,
      awarded_at: undefined,
      revoked_at: undefined,
      revoked_reason: undefined,
    });

    return { created: true, spinId };
  },
});

export const getSubmissionForCreditAction = internalQuery({
  args: {
    submissionId: v.id("bounty_submissions"),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      return null;
    }

    const [bounty, user] = await Promise.all([
      ctx.db.get(submission.bounty_id),
      ctx.db.get(submission.user_id),
    ]);

    return {
      submission,
      bounty,
      user,
    };
  },
});

export const markBountyGrantResult = internalMutation({
  args: {
    submissionId: v.id("bounty_submissions"),
    success: v.boolean(),
    creditedAmount: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      return { success: false };
    }

    const now = Date.now();

    if (args.success) {
      if (submission.credit_status === "granted") {
        return { success: true };
      }

      await ctx.db.patch(args.submissionId, {
        credit_status: "granted",
        credited_amount: args.creditedAmount,
        credit_awarded_at: now,
        updated_at: now,
      });

      return { success: true };
    }

    await ctx.db.patch(args.submissionId, {
      credit_status: "grant_failed",
      updated_at: now,
      admin_review_note: args.error
        ? `${submission.admin_review_note ? `${submission.admin_review_note}\n\n` : ""}Auto-grant error: ${args.error}`
        : submission.admin_review_note,
    });

    return { success: false };
  },
});

export const markBountyRevokeResult = internalMutation({
  args: {
    submissionId: v.id("bounty_submissions"),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      return { success: false };
    }

    const now = Date.now();

    if (args.success) {
      if (submission.credit_status === "revoked") {
        return { success: true };
      }

      await ctx.db.patch(args.submissionId, {
        credit_status: "revoked",
        credit_revoked_at: now,
        updated_at: now,
      });

      return { success: true };
    }

    await ctx.db.patch(args.submissionId, {
      credit_status: "revoke_failed",
      updated_at: now,
      admin_review_note: args.error
        ? `${submission.admin_review_note ? `${submission.admin_review_note}\n\n` : ""}Auto-revoke error: ${args.error}`
        : submission.admin_review_note,
    });

    return { success: false };
  },
});

export const processBountyCreditGrant = internalAction({
  args: {
    submissionId: v.id("bounty_submissions"),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.earn.getSubmissionForCreditAction,
      {
        submissionId: args.submissionId,
      },
    );

    if (!data?.submission || !data.bounty || !data.user?.clerk_id) {
      await ctx.runMutation(internal.earn.markBountyGrantResult, {
        submissionId: args.submissionId,
        success: false,
        creditedAmount: 0,
        error: "Missing submission, bounty, or user data",
      });
      return { success: false };
    }

    if (data.submission.credit_status !== "grant_pending") {
      return { success: true, skipped: true };
    }

    const creditsToGrant =
      data.submission.credited_amount ?? data.bounty.reward_credits;

    if (creditsToGrant <= 0) {
      await ctx.runMutation(internal.earn.markBountyGrantResult, {
        submissionId: args.submissionId,
        success: false,
        creditedAmount: 0,
        error: "Invalid bounty reward amount",
      });
      return { success: false };
    }

    // Use Autumn attach to grant credits via free add-on products.
    // Decompose arbitrary bounty amounts into available product denominations.
    const productIds = decomposeCreditsToProductIds(creditsToGrant);

    if (productIds.length === 0) {
      await ctx.runMutation(internal.earn.markBountyGrantResult, {
        submissionId: args.submissionId,
        success: false,
        creditedAmount: 0,
        error: "No matching earn reward products for amount",
      });
      return { success: false };
    }

    for (const productId of productIds) {
      const result = await attachProduct(data.user.clerk_id, productId);
      if (!result.success) {
        console.error(
          `[Earn] Failed to grant bounty credits for submission ${args.submissionId}:`,
          result.error,
        );

        await ctx.runMutation(internal.earn.markBountyGrantResult, {
          submissionId: args.submissionId,
          success: false,
          creditedAmount: 0,
          error: result.error ?? "Attach failed",
        });

        return { success: false };
      }
    }

    await ctx.runMutation(internal.earn.markBountyGrantResult, {
      submissionId: args.submissionId,
      success: true,
      creditedAmount: creditsToGrant,
    });

    if (data.user.email) {
      await ctx.runAction(internal.email.sendBountySubmissionResultEmail, {
        recipientEmail: data.user.email,
        recipientName: data.user.name ?? "there",
        bountyTitle: data.bounty.title,
        approved: true,
        rewardAmount: creditsToGrant,
      });
    }

    return { success: true };
  },
});

export const processBountyCreditRevoke = internalAction({
  args: {
    submissionId: v.id("bounty_submissions"),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.earn.getSubmissionForCreditAction,
      {
        submissionId: args.submissionId,
      },
    );

    if (!data?.submission || !data.bounty || !data.user?.clerk_id) {
      await ctx.runMutation(internal.earn.markBountyRevokeResult, {
        submissionId: args.submissionId,
        success: false,
        error: "Missing submission, bounty, or user data",
      });
      return { success: false };
    }

    if (data.submission.credit_status !== "revoke_pending") {
      return { success: true, skipped: true };
    }

    const creditsToRevoke =
      data.submission.credited_amount ?? data.bounty.reward_credits;

    if (creditsToRevoke <= 0) {
      await ctx.runMutation(internal.earn.markBountyRevokeResult, {
        submissionId: args.submissionId,
        success: false,
        error: "Invalid bounty reward amount",
      });
      return { success: false };
    }

    const result = await trackUsage(
      data.user.clerk_id,
      creditsToRevoke,
      "agent_credits",
      {
        action: "bounty_credit_revoke",
        submission_id: data.submission._id,
        bounty_id: data.bounty._id,
        bounty_title: data.bounty.title,
        timestamp: Date.now(),
      },
    );

    await ctx.runMutation(internal.earn.markBountyRevokeResult, {
      submissionId: args.submissionId,
      success: result.success,
      error: result.error,
    });

    return { success: result.success };
  },
});

export const adminGrantCreditsInternal = internalAction({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    adminName: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_BOUNTY_REWARD_AMOUNTS.has(args.amount)) {
      throw new Error(
        "Credit amount must be one of the preset amounts (1M, 2M, 4M, 5M, 10M, 20M, 30M, 50M, 70M, or 100M)",
      );
    }

    const user = await ctx.runQuery(internal.admin.getUserByIdInternal, {
      userId: args.userId,
    });

    if (!user?.clerk_id) {
      throw new Error("User not found or missing Clerk ID");
    }

    const productId = EARN_REWARD_PRODUCTS[args.amount];
    if (!productId) {
      throw new Error("No matching earn reward product for this amount");
    }

    const result = await attachProduct(user.clerk_id, productId);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to attach earn reward product");
    }

    console.log(
      `[Earn] Admin ${args.adminName} granted ${args.amount} credits to user ${user.name} (${user.clerk_id})`,
    );

    return { success: true };
  },
});

export const adminGrantCredits = action({
  args: {
    userId: v.id("users"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const admin = await getAuthUser(ctx);
    if (!admin || (admin.role !== "god" && admin.role !== "admin")) {
      throw new Error("Unauthorized: admin role required");
    }

    await ctx.runAction(internal.earn.adminGrantCreditsInternal, {
      userId: args.userId,
      amount: args.amount,
      adminName: admin.name ?? "Unknown admin",
    });

    return { success: true };
  },
});

export const getSpinForCreditAction = internalQuery({
  args: {
    spinId: v.id("referral_spins"),
  },
  handler: async (ctx, args) => {
    const spin = await ctx.db.get(args.spinId);
    if (!spin) {
      return null;
    }

    const user = await ctx.db.get(spin.user);

    return {
      spin,
      user,
    };
  },
});

export const markSpinCreditResult = internalMutation({
  args: {
    spinId: v.id("referral_spins"),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const spin = await ctx.db.get(args.spinId);
    if (!spin) {
      return { success: false };
    }

    const now = Date.now();

    if (args.success) {
      if (spin.status === "awarded") {
        return { success: true };
      }

      await ctx.db.patch(args.spinId, {
        status: "awarded",
        awarded_at: now,
      });

      return { success: true };
    }

    await ctx.db.patch(args.spinId, {
      status: "failed",
      revoked_reason: args.error,
    });

    return { success: false };
  },
});

export const processSpinCreditGrant = internalAction({
  args: {
    spinId: v.id("referral_spins"),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.earn.getSpinForCreditAction, {
      spinId: args.spinId,
    });

    if (!data?.spin || !data.user?.clerk_id) {
      await ctx.runMutation(internal.earn.markSpinCreditResult, {
        spinId: args.spinId,
        success: false,
        error: "Missing spin or user data",
      });
      return { success: false };
    }

    if (data.spin.status !== "spinning") {
      return { success: true, skipped: true };
    }

    const creditsToGrant = data.spin.awarded_credits ?? 0;
    if (creditsToGrant <= 0) {
      await ctx.runMutation(internal.earn.markSpinCreditResult, {
        spinId: args.spinId,
        success: false,
        error: "Invalid spin reward",
      });
      return { success: false };
    }

    // Use Autumn attach to grant credits via a free add-on product.
    // Direct lookup for spin rewards (amounts match exactly).
    const productIds = EARN_REWARD_PRODUCTS[creditsToGrant]
      ? [EARN_REWARD_PRODUCTS[creditsToGrant]]
      : decomposeCreditsToProductIds(creditsToGrant);

    if (productIds.length === 0) {
      await ctx.runMutation(internal.earn.markSpinCreditResult, {
        spinId: args.spinId,
        success: false,
        error: "No matching earn reward product for amount",
      });
      return { success: false };
    }

    for (const productId of productIds) {
      const result = await attachProduct(data.user.clerk_id, productId);
      if (!result.success) {
        console.error(
          `[Earn] Failed to grant spin credits for spin ${args.spinId}:`,
          result.error,
        );

        await ctx.runMutation(internal.earn.markSpinCreditResult, {
          spinId: args.spinId,
          success: false,
          error: result.error ?? "Attach failed",
        });

        return { success: false };
      }
    }

    await ctx.runMutation(internal.earn.markSpinCreditResult, {
      spinId: args.spinId,
      success: true,
    });

    return { success: true };
  },
});
