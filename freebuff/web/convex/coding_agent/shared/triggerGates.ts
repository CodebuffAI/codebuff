import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getAuthUser } from "../../users";
import { getVerifiedAccessProject } from "../../project";
import { checkUserRateLimit, checkPremiumModelRateLimit, checkFreebuffRateLimit } from "../rateLimiter";
import { isFreebuffPremiumModelId } from "@codebuff/common/constants/freebuff-models";

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

  // Premium open-source models carry a stricter daily quota. Enforced for every
  // Freebuff send on a premium model, including platform admins, so the UI
  // counter reflects real usage and reaches zero consistently. Done last so we
  // only consume the premium allowance once the rest of the gates have passed.
  if (
    !args.skipRateLimitCheck &&
    args.agentType === "Freebuff" &&
    isFreebuffPremiumModelId(args.freebuffModel)
  ) {
    const premium = await checkPremiumModelRateLimit(args.ctx, rateLimitKey);
    if (!premium.success) return { ok: false, error: premium.error };
  }

  return { ok: true, user, project, isPlatformAdmin, isSelfHosted };
}
