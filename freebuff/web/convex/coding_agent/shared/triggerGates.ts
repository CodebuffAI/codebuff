import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getAuthUser, getQualifiedReferralCount } from "../../users";
import { getVerifiedAccessProject } from "../../project";
import {
  checkUserRateLimit,
  checkPremiumModelRateLimit,
  checkStandardModelRateLimit,
  checkFreebuffRateLimit,
} from "../rateLimiter";
import {
  isFreebuffPremiumModelId,
  isFreebuffWebGeoExemptModelId,
  resolveFreebuffModel,
  resolveFreebuffWebModelForLimitedTier,
} from "@codebuff/common/constants/freebuff-models";
import { checkLimitedSessionGate, getWebAccessTier } from "./geoAccess";
import {
  readActiveProjectConflict,
  refreshActiveProjectSlot,
} from "../../active_session";

import type { FreebuffWebAccessTier } from "@codebuff/common/constants/freebuff-models";

type User = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;
type Project = NonNullable<
  Awaited<ReturnType<typeof getVerifiedAccessProject>>
>;

interface GateSuccess {
  ok: true;
  user: User;
  project: Project;
  isPlatformAdmin: boolean;
  isSelfHosted: boolean;
  accessTier: FreebuffWebAccessTier;
  /** Freebuff model after tier enforcement. Limited-tier users get premium /
   *  unknown selections coerced to a limited-tier model (mirrors the CLI). */
  freebuffModel?: string;
}

interface GateFailure {
  ok: false;
  error: { kind: string; retryAfter?: number; message?: string };
}

export type GateResult = GateSuccess | GateFailure;

interface GateArgs {
  ctx: MutationCtx;
  message: string;
  projectSemanticIdentifier?: string;
  projectId?: Id<"project">;
  skipRateLimitCheck?: boolean;
  agentType?: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff";
  /** Selected open-source model id (Freebuff only). Premium ids carry an extra
   *  daily quota on top of the normal per-message rate limit. */
  freebuffModel?: string;
}

function getRateLimitKeyForUser(user: User): string {
  // The React hook API keys rate limits by ctx.auth.getUserIdentity().subject.
  // Store that same value on users as freebuff_user_id/clerk_id, and consume the
  // server-side buckets with it so UI counters decrement when messages send.
  return user.freebuff_user_id ?? user.clerk_id ?? user._id;
}

/** Inputs for the gate checks that do NOT require a JWT — everything is
 *  resolved from the DB (or a caller-supplied policy value). The human path
 *  resolves these from `ctx.auth` in `runTriggerGates`; the automation path
 *  (convex/automations.ts) resolves user/project from the row, reads
 *  `referralCount` from the users table, and passes `accessTier: "full"` so the
 *  geo/session gates are skipped while rate-limit/quota/pause still apply. */
export interface ResolvedGateArgs {
  ctx: MutationCtx;
  user: User;
  /** Already access-verified project (caller resolves + checks ownership). */
  project: Project;
  agentType?: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff";
  freebuffModel?: string;
  /** Web referral score: from the JWT for human sends, or
   *  `users.qualified_referral_count` for automations. Scales the daily quota. */
  referralCount: number;
  /** Geo tier: from the JWT for human sends, or `"full"` for automations
   *  (geo is decided once at automation-create time, not re-checked per fire). */
  accessTier: FreebuffWebAccessTier;
  skipRateLimitCheck?: boolean;
}

/**
 * The gate checks that key off the DB-resolved user/project/tier/referral —
 * rate limit, deployments-paused, daily model quota, and (for limited tier) the
 * session pool. Shared by the human path (`runTriggerGates`) and the automation
 * path. Contains no JWT access; the caller supplies `referralCount`/`accessTier`.
 */
export async function runResolvedGates(
  args: ResolvedGateArgs,
): Promise<GateResult> {
  const { ctx, user, project } = args;

  const isGodRole = user.role === "god";
  const isPlatformAdmin = isGodRole || user.role === "admin";
  const rateLimitKey = getRateLimitKeyForUser(user);

  if (args.accessTier === "blocked") {
    return {
      ok: false,
      error: {
        kind: "GeoBlocked",
        message:
          "Access from anonymous networks (Tor, residential proxies) is not supported. Please disable any VPN or proxy and try again.",
      },
    };
  }

  // Limited-region users may only use the geo-exempt free model set; coerce
  // anything else (premium ids, stale localStorage selections) before model
  // quota checks. This means referral tiers still raise limited regions'
  // standard/free-model daily quota, but never unlock premium-model usage
  // there. Full/allowed regions keep both standard and premium tier scaling.
  const freebuffModel =
    args.agentType === "Freebuff"
      ? args.accessTier === "limited"
        ? resolveFreebuffWebModelForLimitedTier(args.freebuffModel)
        : resolveFreebuffModel(args.freebuffModel)
      : args.freebuffModel;

  if (!args.skipRateLimitCheck && !isGodRole) {
    // Freebuff agent chat is gated by its own stricter bucket
    // (20 messages / 3 hours, full burst). All other paths — project
    // creation and the legacy/non-Freebuff agents — keep using the
    // shared userMessages bucket so their behavior is unchanged.
    const rl =
      args.agentType === "Freebuff"
        ? await checkFreebuffRateLimit(ctx, rateLimitKey)
        : await checkUserRateLimit(ctx, rateLimitKey);
    if (!rl.success) return { ok: false, error: rl.error };
  }

  const selfHostedConnection = await ctx.runQuery(
    internal.convex_oauth.connections.getConnectionByProjectId,
    { projectId: project._id },
  );
  const isSelfHosted = !!selfHostedConnection;

  const isCodexWithChatGptAuth =
    args.agentType === "Codex" && user.codex_auth_mode === "chatgpt";

  if (!isPlatformAdmin && !isSelfHosted && !isCodexWithChatGptAuth) {
    const pauseStatus = await ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      { userId: user._id },
    );
    if (pauseStatus) {
      await ctx.scheduler.runAfter(
        0,
        internal.deployment_helpers.checkAndUnpauseUser,
        { userId: user._id },
      );
      return {
        ok: false,
        error: {
          kind: "DEPLOYMENTS_PAUSED",
          message:
            "Your Convex deployments are paused. Please add more Convex credits to continue. If you just added credits, please try again in a few moments.",
        },
      };
    }
  }

  // Every Freebuff send consumes a daily model quota whose rate scales with
  // the user's referral tier: premium models burn the strict premium bucket,
  // everything else burns the standard/free bucket. Limited-region sends have
  // already been coerced to the allowed free model set above, so referrals only
  // scale the free-model bucket for India/other limited regions.
  // Done late so we only consume the allowance once the other gates pass.
  if (!args.skipRateLimitCheck && !isGodRole && args.agentType === "Freebuff") {
    const daily = isFreebuffPremiumModelId(freebuffModel)
      ? await checkPremiumModelRateLimit(
          ctx,
          rateLimitKey,
          args.referralCount,
        )
      : await checkStandardModelRateLimit(
          ctx,
          rateLimitKey,
          args.referralCount,
        );
    if (!daily.success) return { ok: false, error: daily.error };
  }

  // Limited tier: 5 one-hour sessions per Pacific day. Done last so a send
  // that fails an earlier gate never consumes a session start. Geo-exempt
  // Freebuff models (DeepSeek V4 Flash, MiMo 2.5) bypass the session pool
  // entirely — limited regions get unlimited usage on those.
  const isGeoExemptFreebuffSend =
    args.agentType === "Freebuff" && isFreebuffWebGeoExemptModelId(freebuffModel);
  if (
    !args.skipRateLimitCheck &&
    args.accessTier === "limited" &&
    !isGeoExemptFreebuffSend
  ) {
    const session = await checkLimitedSessionGate(ctx, user._id);
    if (!session.success) return { ok: false, error: session.error };
  }

  return {
    ok: true,
    user,
    project,
    isPlatformAdmin,
    isSelfHosted,
    accessTier: args.accessTier,
    freebuffModel,
  };
}

/**
 * Human-send gate: resolves the user, geo tier, referral score, and project
 * from the request's JWT (`ctx.auth`), then delegates the actual checks to
 * `runResolvedGates`. Behavior is unchanged from the original single function.
 */
export async function runTriggerGates(args: GateArgs): Promise<GateResult> {
  const user = await getAuthUser(args.ctx);
  if (!user) {
    return {
      ok: false,
      error: { kind: "AUTH_ERROR", message: "User not found" },
    };
  }

  const identity = await args.ctx.auth.getUserIdentity();
  const qualifiedReferralCount = getQualifiedReferralCount(identity, user);

  // Geographic access tier, resolved by the Next.js token route and carried
  // as a tamper-proof JWT claim. God-role users are exempt from all geo
  // enforcement — checked against the users row, so it can't be spoofed.
  const isGodRole = user.role === "god";
  const accessTier: FreebuffWebAccessTier =
    isGodRole ? "full" : await getWebAccessTier(args.ctx);

  const project = await getVerifiedAccessProject(
    args.ctx,
    user._id,
    args.projectSemanticIdentifier,
    args.projectId,
  );
  if (!project) {
    return {
      ok: false,
      error: {
        kind: "PROJECT_NOT_FOUND",
        message: "Project not found or access denied",
      },
    };
  }

  // One active project/agent at a time per user (backstop for the seamless
  // take-over UI). If a *different* project is actively held, block this send;
  // the client shows a "take over" prompt that pauses the other project.
  if (!isGodRole) {
    const conflict = await readActiveProjectConflict(
      args.ctx,
      user._id,
      project._id,
    );
    if (conflict) {
      return {
        ok: false,
        error: {
          kind: "CONCURRENT_SESSION",
          message:
            "Freebuff is already running in another project. Take over here to continue — this pauses the other project.",
        },
      };
    }
  }

  const result = await runResolvedGates({
    ctx: args.ctx,
    user,
    project,
    agentType: args.agentType,
    freebuffModel: args.freebuffModel,
    referralCount: qualifiedReferralCount,
    accessTier,
    skipRateLimitCheck: args.skipRateLimitCheck,
  });

  // Claim/refresh the active slot for this project once the send is allowed, so
  // the lock is server-authoritative even if a client never heartbeats.
  if (result.ok && !isGodRole) {
    const surface =
      project.project_type === "connected_repo" ? "cloud" : "web";
    await refreshActiveProjectSlot(args.ctx, user._id, project._id, surface);
  }

  return result;
}
