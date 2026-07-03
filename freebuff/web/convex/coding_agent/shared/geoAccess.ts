import {
  FREEBUFF_WEB_LIMITED_PROJECT_DAILY_LIMIT,
  FREEBUFF_WEB_LIMITED_SESSION_LENGTH_MS,
  FREEBUFF_WEB_LIMITED_SESSION_LIMIT,
} from "@codebuff/common/constants/freebuff-models";

import type { FreebuffWebAccessTier } from "@codebuff/common/constants/freebuff-models";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

const PACIFIC_TIMEZONE = "America/Los_Angeles";
/** Fallback when Intl timezone data is unavailable: fixed UTC-8 (PST). */
const PACIFIC_FALLBACK_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIMITED_PROJECT_DAILY_LIMIT_MESSAGE =
"your region is limited to 1 project per day";

/**
 * Reads the geo-derived access tier from the Convex JWT. The claim is set by
 * the Next.js convex-token route (the only place request headers/IP are
 * visible) and refreshes with the token (<=10 min). A missing claim — e.g. a
 * token minted before this deploy — is treated as full; it self-corrects on
 * the next refresh.
 */
export async function getWebAccessTier(
  ctx: QueryCtx | MutationCtx,
): Promise<FreebuffWebAccessTier> {
  const identity = await ctx.auth.getUserIdentity();
  const tier = (identity as Record<string, unknown> | null)?.access_tier;
  if (tier === "limited" || tier === "blocked") return tier;
  return "full";
}

function pacificDayParts(now: number): {
  dayKey: string;
  msIntoDay: number;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: PACIFIC_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "00";
    const dayKey = `${get("year")}-${get("month")}-${get("day")}`;
    const msIntoDay =
      (Number(get("hour")) * 3600 +
        Number(get("minute")) * 60 +
        Number(get("second"))) *
      1000;
    return { dayKey, msIntoDay };
  } catch {
    const shifted = new Date(now - PACIFIC_FALLBACK_OFFSET_MS);
    return {
      dayKey: shifted.toISOString().slice(0, 10),
      msIntoDay:
        (shifted.getUTCHours() * 3600 +
          shifted.getUTCMinutes() * 60 +
          shifted.getUTCSeconds()) *
        1000,
    };
  }
}

export function getPacificDayKey(now: number): string {
  return pacificDayParts(now).dayKey;
}

/** Approximate ms until the next midnight Pacific (DST transition days are
 *  off by up to an hour, which only affects the displayed retry time). */
export function msUntilNextPacificMidnight(now: number): number {
  return Math.max(0, DAY_MS - pacificDayParts(now).msIntoDay);
}

async function countProjectsCreatedTodayForOwner(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  dayKey: string,
): Promise<number> {
  const memberships = await ctx.db
    .query("project_member")
    .withIndex("by_user", (q) => q.eq("user", userId))
    .collect();

  const ownerProjectIds = Array.from(
    new Set(
      memberships
        .filter((membership) => membership.project_role === "owner")
        .map((membership) => membership.project),
    ),
  );

  if (ownerProjectIds.length === 0) return 0;

  const ownedProjects = await Promise.all(
    ownerProjectIds.map((projectId) => ctx.db.get(projectId)),
  );

  let projectsCreatedToday = 0;
  for (const project of ownedProjects) {
    if (!project) continue;
    if (getPacificDayKey(project._creationTime) !== dayKey) continue;
    projectsCreatedToday += 1;
  }

  return projectsCreatedToday;
}

export type LimitedProjectCreationStatus = {
  dailyLimit: number;
  projectsCreatedToday: number;
  projectsRemaining: number;
  resetsInMs: number;
};

/** Read-only view of the limited-tier project-creation quota for UI display. */
export async function getLimitedProjectCreationStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<LimitedProjectCreationStatus> {
  const now = Date.now();
  const dayKey = getPacificDayKey(now);
  const projectsCreatedToday = await countProjectsCreatedTodayForOwner(
    ctx,
    userId,
    dayKey,
  );

  return {
    dailyLimit: FREEBUFF_WEB_LIMITED_PROJECT_DAILY_LIMIT,
    projectsCreatedToday,
    projectsRemaining: Math.max(
      0,
      FREEBUFF_WEB_LIMITED_PROJECT_DAILY_LIMIT - projectsCreatedToday,
    ),
    resetsInMs: msUntilNextPacificMidnight(now),
  };
}

export type LimitedProjectGateResult =
  | { success: true }
  | {
      success: false;
      error: { kind: string; retryAfter: number; message: string };
    };

/**
 * Limited-tier project quota: outer-region users may create at most
 * FREEBUFF_WEB_LIMITED_PROJECT_DAILY_LIMIT projects per Pacific day.
 */
export async function checkLimitedProjectCreationGate(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<LimitedProjectGateResult> {
  const status = await getLimitedProjectCreationStatus(ctx, userId);
  if (status.projectsCreatedToday < status.dailyLimit) {
    return { success: true };
  }

  return {
    success: false,
    error: {
      kind: "LimitedProjectRateLimited",
      retryAfter: status.resetsInMs,
      message: LIMITED_PROJECT_DAILY_LIMIT_MESSAGE,
    },
  };
}

export type LimitedSessionGateResult =
  | { success: true }
  | {
      success: false;
      error: { kind: string; retryAfter: number; message: string };
    };

/**
 * Limited-tier session quota: an active session (started within the last
 * hour) admits the message for free; otherwise a new 1-hour session starts,
 * capped at FREEBUFF_WEB_LIMITED_SESSION_LIMIT starts per Pacific day. All
 * reads are point-indexed and bounded (at most LIMIT rows per user per day).
 */
export async function checkLimitedSessionGate(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<LimitedSessionGateResult> {
  const now = Date.now();

  const activeSession = await ctx.db
    .query("web_limited_sessions")
    .withIndex("by_user_and_expires", (q) =>
      q.eq("user_id", userId).gt("expires_at", now),
    )
    .first();
  if (activeSession) return { success: true };

  const dayKey = getPacificDayKey(now);
  const sessionsToday = await ctx.db
    .query("web_limited_sessions")
    .withIndex("by_user_and_day", (q) =>
      q.eq("user_id", userId).eq("day", dayKey),
    )
    .collect();

  if (sessionsToday.length >= FREEBUFF_WEB_LIMITED_SESSION_LIMIT) {
    const retryAfter = msUntilNextPacificMidnight(now);
    return {
      success: false,
      error: {
        kind: "LimitedRateLimited",
        retryAfter,
        message: `You've used all ${FREEBUFF_WEB_LIMITED_SESSION_LIMIT} one-hour sessions for today. Your sessions reset at midnight Pacific time.`,
      },
    };
  }

  await ctx.db.insert("web_limited_sessions", {
    user_id: userId,
    started_at: now,
    expires_at: now + FREEBUFF_WEB_LIMITED_SESSION_LENGTH_MS,
    day: dayKey,
  });
  return { success: true };
}

export type LimitedSessionStatus = {
  sessionsRemaining: number;
  activeSessionExpiresAt: number | null;
  resetsInMs: number;
};

/** Read-only view of the limited-tier quota for UI display. */
export async function getLimitedSessionStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<LimitedSessionStatus> {
  const now = Date.now();

  const activeSession = await ctx.db
    .query("web_limited_sessions")
    .withIndex("by_user_and_expires", (q) =>
      q.eq("user_id", userId).gt("expires_at", now),
    )
    .first();

  const dayKey = getPacificDayKey(now);
  const sessionsToday = await ctx.db
    .query("web_limited_sessions")
    .withIndex("by_user_and_day", (q) =>
      q.eq("user_id", userId).eq("day", dayKey),
    )
    .collect();

  return {
    sessionsRemaining: Math.max(
      0,
      FREEBUFF_WEB_LIMITED_SESSION_LIMIT - sessionsToday.length,
    ),
    activeSessionExpiresAt: activeSession?.expires_at ?? null,
    resetsInMs: msUntilNextPacificMidnight(now),
  };
}
