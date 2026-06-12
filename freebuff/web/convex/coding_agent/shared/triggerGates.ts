import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getAuthUser } from "../../users";
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
  resolveFreebuffWebModelForLimitedTier,
} from "@codebuff/common/constants/freebuff-models";
import { checkLimitedSessionGate, getWebAccessTier } from "./geoAccess";

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

export async function runTriggerGates(args: GateArgs): Promise<GateResult> {
  const user = await getAuthUser(args.ctx);
  if (!user) {
    return {
      ok: false,
      error: { kind: "AUTH_ERROR", message: "User not found" },
    };
  }

  const isPlatformAdmin = user.role === "god" || user.role === "admin";
  const rateLimitKey = getRateLimitKeyForUser(user);

  // Geographic access tier, resolved by the Next.js token route and carried
  // as a tamper-proof JWT claim. God-role users are exempt from all geo
  // enforcement — checked against the users row, so it can't be spoofed.
  const accessTier: FreebuffWebAccessTier =
    user.role === "god" ? "full" : await getWebAccessTier(args.ctx);

  if (accessTier === "blocked") {
    return {
      ok: false,
      error: {
        kind: "GeoBlocked",
        message:
          "Access from anonymous networks (Tor, residential proxies) is not supported. Please disable any VPN or proxy and try again.",
      },
    };
  }

  // Limited tier may only use the geo-exempt + limited model set; coerce
  // anything else (premium ids, stale localStorage selections) instead of
  // rejecting, matching the CLI's behavior.
  const freebuffModel =
    args.agentType === "Freebuff" && accessTier === "limited"
      ? resolveFreebuffWebModelForLimitedTier(args.freebuffModel)
      : args.freebuffModel;

  if (!args.skipRateLimitCheck) {
    // Freebuff agent chat is gated by its own stricter bucket
    // (20 messages / 3 hours, full burst). All other paths — project
    // creation and the legacy/non-Freebuff agents — keep using the
    // shared userMessages bucket so their behavior is unchanged.
    const rl =
      args.agentType === "Freebuff"
        ? await checkFreebuffRateLimit(args.ctx, rateLimitKey)
        : await checkUserRateLimit(args.ctx, rateLimitKey);
    if (!rl.success) return { ok: false, error: rl.error };
  }

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

  const selfHostedConnection = await args.ctx.runQuery(
    internal.convex_oauth.connections.getConnectionByProjectId,
    { projectId: project._id },
  );
  const isSelfHosted = !!selfHostedConnection;

  const isCodexWithChatGptAuth =
    args.agentType === "Codex" && user.codex_auth_mode === "chatgpt";

  if (!isPlatformAdmin && !isSelfHosted && !isCodexWithChatGptAuth) {
    const pauseStatus = await args.ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      { userId: user._id },
    );
    if (pauseStatus) {
      await args.ctx.scheduler.runAfter(
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
  // everything else burns the (very generous) standard bucket. Enforced for
  // everyone, including platform admins, so UI counters reflect real usage.
  // Done late so we only consume the allowance once the other gates pass.
  if (!args.skipRateLimitCheck && args.agentType === "Freebuff") {
    const daily = isFreebuffPremiumModelId(freebuffModel)
      ? await checkPremiumModelRateLimit(
          args.ctx,
          rateLimitKey,
          user.qualified_referral_count,
        )
      : await checkStandardModelRateLimit(
          args.ctx,
          rateLimitKey,
          user.qualified_referral_count,
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
    accessTier === "limited" &&
    !isGeoExemptFreebuffSend
  ) {
    const session = await checkLimitedSessionGate(args.ctx, user._id);
    if (!session.success) return { ok: false, error: session.error };
  }

  return {
    ok: true,
    user,
    project,
    isPlatformAdmin,
    isSelfHosted,
    accessTier,
    freebuffModel,
  };
}
