import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import {
  getReferralTier,
  type FreebuffReferralTier,
} from "@codebuff/common/constants/freebuff-referral-tiers";
import { components } from "../_generated/api";
import { query } from "../_generated/server";
import { getAuthUser } from "../users";
import type { MutationCtx, ActionCtx, QueryCtx } from "../_generated/server";
import type { GenericQueryCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";

const DAY = 24 * HOUR;

// Daily per-model-class quotas are NOT in the static config map below:
// their rate scales with the user's referral tier, so every check passes an
// inline `config` (supported by @convex-dev/rate-limiter for dynamic
// configs). Usage state is keyed by these bucket names either way.
const PREMIUM_MODEL_BUCKET = "premiumModelMessages";
const STANDARD_MODEL_BUCKET = "standardModelMessages";

function premiumModelConfig(tier: FreebuffReferralTier) {
  return {
    kind: "fixed window" as const,
    rate: tier.premiumModelDailyLimit,
    period: DAY,
  };
}

function standardModelConfig(tier: FreebuffReferralTier) {
  return {
    kind: "fixed window" as const,
    rate: tier.standardModelDailyLimit,
    period: DAY,
  };
}

// Initialize rate limiter with token bucket for smooth rate limiting
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Token bucket: 20 tokens per hour, max capacity of 10 (burst protection)
  // Tokens refill gradually (~1 every 3 minutes) instead of all at once
  // This eliminates boundary issues and provides smoother rate limiting
  // NOTE: Used by project creation and all non-Freebuff agent paths.
  // Freebuff agent chat uses the separate freebuffMessages bucket below.
  userMessages: {
    kind: "token bucket",
    rate: 20, // Refill 20 tokens per hour
    period: HOUR,
    capacity: 10, // Maximum 10 tokens can be held (burst limit)
  },
  // Freebuff agent chat: 20 messages per 3 hours, full burst.
  // Capacity equals rate so a fresh user can fire all 20 immediately,
  // then must wait for the bucket to refill over 3 hours.
  // Project creation and other agents are NOT counted against this bucket.
  freebuffMessages: {
    kind: "token bucket",
    rate: 20, // Refill 20 tokens per period
    period: 3 * HOUR,
    capacity: 20, // Full burst allowed; no per-message pacing
  },
  // Fixed window: 1 request per 15 seconds for refine prompt
  refinePrompt: {
    kind: "fixed window",
    rate: 1, // 1 request
    period: 15000, // 15 seconds in milliseconds
  },
  // Import-projects OTP send: 3 emails per hour per requester
  importOtpSends: {
    kind: "fixed window",
    rate: 3,
    period: HOUR,
  },
  // Import-projects OTP verify attempts: 10 per 15 min per requester
  importOtpVerifies: {
    kind: "fixed window",
    rate: 10,
    period: 15 * 60 * 1000,
  },
});

// Helper function to get user ID for rate limiting
// Uses Clerk ID as the rate limit key since it uniquely identifies users
// Accepts any ctx with auth (typed QueryCtx or the generic hookAPI ctx).
async function getUserIdForRateLimit(ctx: {
  auth: Pick<GenericQueryCtx<GenericDataModel>["auth"], "getUserIdentity">;
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? "anonymous";
}

// Export hook API for frontend React components to check rate limit status
// This allows the UI to proactively show rate limit status before attempting requests
export const { getRateLimit, getServerTime } = rateLimiter.hookAPI(
  "userMessages",
  {
    key: getUserIdForRateLimit,
  },
);

/** Resolve the caller's referral tier (drives the daily model quotas). */
async function getReferralTierForCaller(
  ctx: QueryCtx,
): Promise<FreebuffReferralTier> {
  const user = await getAuthUser(ctx);
  return getReferralTier(user?.qualified_referral_count);
}

// Validator matching the args the useRateLimit React hook sends. The
// server ignores the client-sent key/config and derives both itself so a
// client can't inspect someone else's quota or spoof a bigger limit.
const rateLimitHookArgs = {
  name: v.optional(v.string()),
  key: v.optional(v.string()),
  sampleShards: v.optional(v.number()),
  config: v.optional(v.any()),
};

// Read-only query for the premium-model daily quota so the UI can show how
// many premium runs remain today without consuming any. Tier-aware: the
// rate in the returned config reflects the caller's referral tier.
export const getPremiumModelRateLimit = query({
  args: rateLimitHookArgs,
  handler: async (ctx) => {
    const [key, tier] = await Promise.all([
      getUserIdForRateLimit(ctx),
      getReferralTierForCaller(ctx),
    ]);
    return await rateLimiter.getValue(ctx, PREMIUM_MODEL_BUCKET, {
      key,
      config: premiumModelConfig(tier),
    });
  },
});

// Same for the standard-model daily quota (all non-premium Freebuff models).
export const getStandardModelRateLimit = query({
  args: rateLimitHookArgs,
  handler: async (ctx) => {
    const [key, tier] = await Promise.all([
      getUserIdForRateLimit(ctx),
      getReferralTierForCaller(ctx),
    ]);
    return await rateLimiter.getValue(ctx, STANDARD_MODEL_BUCKET, {
      key,
      config: standardModelConfig(tier),
    });
  },
});
// Hook API bound to the Freebuff-only bucket. Lets AgentChatShell (or any other
// Freebuff-specific UI) display a proactive countdown that reflects the
// 20-per-3-hours cap rather than the legacy userMessages bucket.
export const {
  getRateLimit: getFreebuffRateLimit,
  getServerTime: getFreebuffServerTime,
} = rateLimiter.hookAPI("freebuffMessages", {
  key: getUserIdForRateLimit,
});

export type RateLimitResult =
  | { success: true }
  | {
      success: false;
      error: {
        kind: string;
        retryAfter: number;
        message: string;
      };
    };

/**
 * Check token bucket rate limit for a user
 * Uses a token bucket with 20 tokens/hour refill rate and 10 token capacity
 * @param ctx - Convex mutation context
 * @param userId - User ID to check rate limits for
 * @returns RateLimitResult indicating success or rate limit error
 */
export async function checkUserRateLimit(
  ctx: MutationCtx,
  userId: string,
): Promise<RateLimitResult> {

  const status = await rateLimiter.limit(ctx, "userMessages", {
    key: userId,
    throws: false,
  });

  if (!status.ok) {
    console.log(
      `[RateLimit] User ${userId} hit rate limit, retry after: ${status.retryAfter}ms`,
    );
    return {
      success: false,
      error: {
        kind: "RateLimited",
        retryAfter: status.retryAfter,
        message: "Rate limit exceeded. Please try again in a moment.",
      },
    };
  }

  return { success: true };
}

/**
 * Check (and consume) the daily premium-model quota for a user. Call this only
 * when the user is actually sending a message on a premium model so we don't
 * burn the allowance on unlimited models. The daily rate scales with the
 * user's referral tier.
 * @param ctx - Convex mutation context
 * @param userId - User ID to check premium limits for
 * @param qualifiedReferralCount - The user's qualified referral count
 * @returns RateLimitResult indicating success or a premium-limit error
 */
export async function checkPremiumModelRateLimit(
  ctx: MutationCtx,
  userId: string,
  qualifiedReferralCount?: number | null,
): Promise<RateLimitResult> {
  const tier = getReferralTier(qualifiedReferralCount);
  const status = await rateLimiter.limit(ctx, PREMIUM_MODEL_BUCKET, {
    key: userId,
    config: premiumModelConfig(tier),
    throws: false,
  });

  if (!status.ok) {
    console.log(
      `[RateLimit] User ${userId} hit premium model daily limit (tier ${tier.tier}), retry after: ${status.retryAfter}ms`,
    );
    return {
      success: false,
      error: {
        kind: "PremiumRateLimited",
        retryAfter: status.retryAfter,
        message: `You've used all ${tier.premiumModelDailyLimit} premium Freebuff messages for today. Switch to a standard model, or get qualified referrals to raise your daily limit.`,
      },
    };
  }

  return { success: true };
}

/**
 * Check (and consume) the daily standard-model quota for a user. Applies to
 * every non-premium Freebuff model. The cap is deliberately very high (see
 * FREEBUFF_REFERRAL_TIERS) so normal users never hit it; it exists to stop
 * abuse and to give referrals a meaningful unlock.
 * @param ctx - Convex mutation context
 * @param userId - User ID to check standard limits for
 * @param qualifiedReferralCount - The user's qualified referral count
 * @returns RateLimitResult indicating success or a standard-limit error
 */
export async function checkStandardModelRateLimit(
  ctx: MutationCtx,
  userId: string,
  qualifiedReferralCount?: number | null,
): Promise<RateLimitResult> {
  const tier = getReferralTier(qualifiedReferralCount);
  const status = await rateLimiter.limit(ctx, STANDARD_MODEL_BUCKET, {
    key: userId,
    config: standardModelConfig(tier),
    throws: false,
  });

  if (!status.ok) {
    console.log(
      `[RateLimit] User ${userId} hit standard model daily limit (tier ${tier.tier}), retry after: ${status.retryAfter}ms`,
    );
    return {
      success: false,
      error: {
        kind: "StandardRateLimited",
        retryAfter: status.retryAfter,
        message: `You've used all ${tier.standardModelDailyLimit} standard Freebuff messages for today. Get qualified referrals to raise your daily limit.`,
      },
    };
  }

  return { success: true };
}

/**
 * Check rate limit for refine prompt action
 * Uses a fixed window with 1 request per 15 seconds
 * @param ctx - Convex action or mutation context
 * @param userId - User ID to check rate limits for
 * @returns RateLimitResult indicating success or rate limit error
 */
export async function checkRefinePromptRateLimit(
  ctx: ActionCtx | MutationCtx,
  userId: string,
): Promise<RateLimitResult> {
  console.log(`[RateLimit] Checking refine prompt limits for user ${userId}`);

  const status = await rateLimiter.limit(ctx, "refinePrompt", {
    key: userId,
    throws: false,
  });

  if (!status.ok) {
    console.log(
      `[RateLimit] User ${userId} hit refine prompt rate limit, retry after: ${status.retryAfter}ms`,
    );
    return {
      success: false,
      error: {
        kind: "RateLimited",
        retryAfter: status.retryAfter,
        message: `Please wait ${Math.ceil(status.retryAfter / 1000)} seconds before refining another prompt.`,
      },
    };
  }

  return { success: true };
}

/**
 * Check Freebuff-specific rate limit (20 messages per 3 hours, full burst).
 * Used ONLY for the Freebuff agent chat path. Project creation and any other
 * agent paths still use checkUserRateLimit so their behavior is unchanged.
 * @param ctx - Convex mutation context
 * @param userId - User ID to check rate limits for
 * @returns RateLimitResult indicating success or rate limit error
 */
export async function checkFreebuffRateLimit(
  ctx: MutationCtx,
  userId: string,
): Promise<RateLimitResult> {
  const status = await rateLimiter.limit(ctx, "freebuffMessages", {
    key: userId,
    throws: false,
  });

  if (!status.ok) {
    console.log(
      `[RateLimit] User ${userId} hit Freebuff rate limit, retry after: ${status.retryAfter}ms`,
    );
    return {
      success: false,
      error: {
        kind: "RateLimited",
        retryAfter: status.retryAfter,
        message:
          "You've hit the Freebuff message limit (20 per 3 hours). Please wait before sending again.",
      },
    };
  }

  return { success: true };
}
