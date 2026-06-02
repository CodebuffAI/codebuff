import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { MutationCtx, ActionCtx } from "../_generated/server";
import type { GenericQueryCtx, GenericDataModel } from "convex/server";

// Initialize rate limiter with token bucket for smooth rate limiting
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Token bucket: 20 tokens per hour, max capacity of 10 (burst protection)
  // Tokens refill gradually (~1 every 3 minutes) instead of all at once
  // This eliminates boundary issues and provides smoother rate limiting
  userMessages: {
    kind: "token bucket",
    rate: 20, // Refill 20 tokens per hour
    period: HOUR,
    capacity: 10, // Maximum 10 tokens can be held (burst limit)
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
async function getUserIdForRateLimit(
  ctx: GenericQueryCtx<GenericDataModel>,
): Promise<string> {
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
  console.log(`[RateLimit] Checking limits for user ${userId}`);

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
