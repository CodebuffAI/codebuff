import { v } from "convex/values";
import { Crons } from "@convex-dev/crons";

import { components, internal } from "!/_generated/api";
import { Doc, Id } from "!/_generated/dataModel";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "!/_generated/server";
import { getAuthUser } from "!/users";
import { getVerifiedAccessProject } from "!/project";
import { getWebAccessTier } from "!/coding_agent/shared/geoAccess";
import { runResolvedGates } from "!/coding_agent/shared/triggerGates";
import { startFreebuffRunCore } from "!/coding_agent/cli_agent/trigger";

// Automations: user-configured scheduled agent runs. Each enabled automation
// owns one runtime-registered cron in the @convex-dev/crons component. On fire,
// `fireAutomation` (the cron target) runs the gates and starts a fresh-thread
// Freebuff run, reusing the same machinery as a human send
// (`startFreebuffRunCore`). The JWT is checked once at create time (geo gate);
// each fire enforces only DB-resident limits (rate/quota/pause/terminated).
const crons = new Crons(components.crons);

const MAX_NAME_LENGTH = 80;
const MAX_PROMPT_LENGTH = 10_000;

type LastRunStatus = NonNullable<Doc<"automation">["last_run_status"]>;

/**
 * Basic 5- or 6-field cronspec sanity check (interpreted as UTC). Deeper
 * validation happens inside the crons component on register; this gives a
 * friendly early error and trims the value. Returns the normalized spec.
 */
function validateCronSpec(cronSpec: string): string {
  const trimmed = cronSpec.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) {
    throw new Error(
      "Invalid cron schedule: expected 5 fields (minute hour day month weekday).",
    );
  }
  const fieldPattern = /^[\d*/,\-A-Za-z]+$/;
  for (const field of fields) {
    if (!fieldPattern.test(field)) {
      throw new Error(`Invalid cron schedule field: "${field}".`);
    }
  }
  return trimmed;
}

/** Map a gate/start failure kind to a `last_run_status` value. */
function mapFailureKindToStatus(kind: string): LastRunStatus {
  if (kind === "DEPLOYMENTS_PAUSED" || kind === "PROJECT_TERMINATED") {
    return "paused";
  }
  const k = kind.toLowerCase();
  if (
    k.includes("premium") ||
    k.includes("standard") ||
    k.includes("quota") ||
    k.includes("daily")
  ) {
    return "quota_exceeded";
  }
  if (k.includes("rate") || k.includes("limit")) {
    return "rate_limited";
  }
  return "error";
}

// Automations are gated to god-role accounts for now (internal/beta feature).
// The gate is enforced on every user-facing function below (assertGod) — most
// importantly at create time. The internal cron path
// (fireAutomation/startAutomationRun) runs as the system and is not gated.
const NOT_GOD_MESSAGE =
  "Automations are currently available to god-mode accounts only.";

/** Throw unless the caller is an authenticated god-role user. Narrows `user`. */
function assertGod(
  user: Doc<"users"> | null,
): asserts user is Doc<"users"> {
  if (!user || user.role !== "god") {
    throw new Error(NOT_GOD_MESSAGE);
  }
}

/**
 * Load an automation and verify the caller still has access to its project.
 * Throws on auth / not-found / access errors. Used by the owner-facing
 * mutations (update/toggle/delete/run-now).
 */
async function loadAccessibleAutomation(
  ctx: MutationCtx,
  automationId: Id<"automation">,
): Promise<{ user: Doc<"users">; automation: Doc<"automation"> }> {
  const user = await getAuthUser(ctx);
  assertGod(user);
  const automation = await ctx.db.get(automationId);
  if (!automation) {
    throw new Error("Automation not found");
  }
  const project = await getVerifiedAccessProject(
    ctx,
    user._id,
    undefined,
    automation.project_id,
    "read",
    user,
  );
  if (!project) {
    throw new Error("Project not found or access denied");
  }
  return { user, automation };
}

export const listAutomations = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") return [];
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
      "read",
      user,
    );
    if (!project) return [];
    return await ctx.db
      .query("automation")
      .withIndex("by_project", (q) => q.eq("project_id", project._id))
      .order("desc")
      .collect();
  },
});

export const createAutomation = mutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    prompt: v.string(),
    freebuffModel: v.optional(v.string()),
    cronSpec: v.string(),
    /** IANA timezone the schedule was authored in (display/edit only). */
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    assertGod(user);

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
      "read",
      user,
    );
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Create-time JWT gate: geo access is decided once, here. Scheduled fires
    // have no JWT and never re-check geo (see startAutomationRun).
    const accessTier =
      user.role === "god" ? "full" : await getWebAccessTier(ctx);
    if (accessTier === "blocked") {
      throw new Error(
        "Automations are not available from anonymous networks. Disable any VPN/proxy and try again.",
      );
    }

    if (!project.sandbox_id || !project.sandbox_id.startsWith("daytona:")) {
      throw new Error("This project does not have a Daytona sandbox.");
    }

    const name = args.name.trim();
    if (!name) throw new Error("Automation name is required.");
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error("Automation name is too long.");
    }
    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("Automation prompt is required.");
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error("Automation prompt is too long.");
    }
    const cronSpec = validateCronSpec(args.cronSpec);
    const freebuffModel = args.freebuffModel?.trim() || undefined;
    const timezone = args.timezone?.trim() || undefined;

    const automationId = await ctx.db.insert("automation", {
      user_id: user._id,
      project_id: project._id,
      name,
      prompt,
      ...(freebuffModel ? { freebuff_model: freebuffModel } : {}),
      cron_spec: cronSpec,
      ...(timezone ? { cron_timezone: timezone } : {}),
      enabled: true,
      created_by: user._id,
    });

    // Register the runtime cron + persist its id in the same transaction so the
    // row and the live cron commit atomically.
    const cronId = await crons.register(
      ctx,
      { kind: "cron", cronspec: cronSpec },
      internal.automations.fireAutomation,
      { automationId },
    );
    await ctx.db.patch(automationId, { cron_component_id: cronId });

    return { automationId };
  },
});

export const updateAutomation = mutation({
  args: {
    automationId: v.id("automation"),
    name: v.optional(v.string()),
    prompt: v.optional(v.string()),
    freebuffModel: v.optional(v.string()),
    cronSpec: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { automation } = await loadAccessibleAutomation(
      ctx,
      args.automationId,
    );

    const patch: {
      name?: string;
      prompt?: string;
      freebuff_model?: string;
      cron_spec?: string;
      cron_timezone?: string;
      cron_component_id?: string;
    } = {};

    if (args.timezone !== undefined) {
      patch.cron_timezone = args.timezone.trim() || undefined;
    }

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Automation name is required.");
      if (name.length > MAX_NAME_LENGTH) {
        throw new Error("Automation name is too long.");
      }
      patch.name = name;
    }
    if (args.prompt !== undefined) {
      const prompt = args.prompt.trim();
      if (!prompt) throw new Error("Automation prompt is required.");
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new Error("Automation prompt is too long.");
      }
      patch.prompt = prompt;
    }
    if (args.freebuffModel !== undefined) {
      patch.freebuff_model = args.freebuffModel.trim() || undefined;
    }
    if (args.cronSpec !== undefined) {
      const cronSpec = validateCronSpec(args.cronSpec);
      patch.cron_spec = cronSpec;
      // The component has no in-place reschedule: delete + re-register. Only
      // touch the live cron when the automation is currently enabled.
      if (automation.enabled && automation.cron_component_id) {
        await crons.delete(ctx, { id: automation.cron_component_id });
        patch.cron_component_id = await crons.register(
          ctx,
          { kind: "cron", cronspec: cronSpec },
          internal.automations.fireAutomation,
          { automationId: automation._id },
        );
      }
    }

    await ctx.db.patch(automation._id, patch);
    return { success: true as const };
  },
});

export const toggleAutomation = mutation({
  args: { automationId: v.id("automation"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const { automation } = await loadAccessibleAutomation(
      ctx,
      args.automationId,
    );
    if (automation.enabled === args.enabled) {
      return { success: true as const };
    }

    if (args.enabled) {
      // Re-register a fresh cron (disabled automations hold no live cron).
      const cronId =
        automation.cron_component_id ??
        (await crons.register(
          ctx,
          { kind: "cron", cronspec: automation.cron_spec },
          internal.automations.fireAutomation,
          { automationId: automation._id },
        ));
      await ctx.db.patch(automation._id, {
        enabled: true,
        cron_component_id: cronId,
      });
    } else {
      if (automation.cron_component_id) {
        await crons.delete(ctx, { id: automation.cron_component_id });
      }
      await ctx.db.patch(automation._id, {
        enabled: false,
        cron_component_id: undefined,
      });
    }
    return { success: true as const };
  },
});

export const deleteAutomation = mutation({
  args: { automationId: v.id("automation") },
  handler: async (ctx, args) => {
    const { automation } = await loadAccessibleAutomation(
      ctx,
      args.automationId,
    );
    if (automation.cron_component_id) {
      await crons.delete(ctx, { id: automation.cron_component_id });
    }
    await ctx.db.delete(automation._id);
    return { success: true as const };
  },
});

/** Manual "run now": fire the automation immediately, bypassing the schedule. */
export const runAutomationNow = mutation({
  args: { automationId: v.id("automation") },
  handler: async (ctx, args) => {
    await loadAccessibleAutomation(ctx, args.automationId);
    return await startAutomationRun(ctx, args.automationId);
  },
});

/** The cron target. Kept tiny and non-throwing — all work + error handling is
 *  in `startAutomationRun`. */
export const fireAutomation = internalMutation({
  args: { automationId: v.id("automation") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.automationId);
    if (!automation || !automation.enabled) return null; // deleted/disabled mid-flight
    await startAutomationRun(ctx, args.automationId);
    return null;
  },
});

type AutomationRunResult =
  | { success: true; threadId: Id<"agent_thread"> }
  | { success: false; status: LastRunStatus; error?: string };

/**
 * Run the gates from DB-resolved inputs (no JWT) and start a fresh-thread
 * Freebuff run. Records the outcome on the automation row and NEVER throws — a
 * gate failure or unexpected error is recorded on `last_run_status` so the cron
 * firing stays healthy and the next scheduled tick still fires.
 */
async function startAutomationRun(
  ctx: MutationCtx,
  automationId: Id<"automation">,
): Promise<AutomationRunResult> {
  const now = Date.now();
  try {
    const automation = await ctx.db.get(automationId);
    if (!automation || !automation.enabled) {
      if (automation) {
        await ctx.db.patch(automationId, {
          last_run_at: now,
          last_run_status: "skipped",
          last_run_error: "Automation disabled or missing",
        });
      }
      return { success: false, status: "skipped" };
    }

    const user = await ctx.db.get(automation.user_id);
    if (!user) {
      await ctx.db.patch(automationId, {
        last_run_at: now,
        last_run_status: "skipped",
        last_run_error: "Owner not found",
      });
      return { success: false, status: "skipped" };
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      automation.project_id,
      "read",
      user,
    );
    if (!project) {
      await ctx.db.patch(automationId, {
        last_run_at: now,
        last_run_status: "skipped",
        last_run_error: "Project not found or access lost",
      });
      return { success: false, status: "skipped" };
    }

    // Run-time gate: only DB-resident limits. accessTier "full" skips the
    // JWT-only geo/session gates (geo was decided at create time); referral
    // scaling reads the denormalized users.qualified_referral_count.
    const gates = await runResolvedGates({
      ctx,
      user,
      project,
      agentType: "Freebuff",
      freebuffModel: automation.freebuff_model,
      referralCount: user.qualified_referral_count ?? 0,
      accessTier: "full",
      skipRateLimitCheck: false,
    });
    if (!gates.ok) {
      const status = mapFailureKindToStatus(gates.error.kind);
      await ctx.db.patch(automationId, {
        last_run_at: now,
        last_run_status: status,
        last_run_error: gates.error.message ?? gates.error.kind,
      });
      return { success: false, status, error: gates.error.message };
    }

    const result = await startFreebuffRunCore({
      ctx,
      user: gates.user,
      project: gates.project,
      message: automation.prompt,
      agentType: "Freebuff",
      resolvedFreebuffModel: gates.freebuffModel,
      forceNewThread: true,
      automationId,
    });
    if (!result.success) {
      const status = mapFailureKindToStatus(result.error.kind);
      await ctx.db.patch(automationId, {
        last_run_at: now,
        last_run_status: status,
        last_run_error: result.error.message ?? result.error.kind,
      });
      return { success: false, status, error: result.error.message };
    }

    // Admin per-agent-type counter (a prompt was issued). We intentionally do
    // NOT record user DAU here — an automation firing isn't human activity.
    await ctx.scheduler.runAfter(
      0,
      internal.admin_agent_stats.recordAgentPrompt,
      { agentType: "Freebuff" },
    );

    await ctx.db.patch(automationId, {
      last_run_at: now,
      last_run_status: "success",
      last_run_error: undefined,
      last_run_thread_id: result.threadId,
    });
    return { success: true, threadId: result.threadId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    console.error("[automations] startAutomationRun failed", {
      automationId,
      error,
    });
    try {
      await ctx.db.patch(automationId, {
        last_run_at: now,
        last_run_status: "error",
        last_run_error: message,
      });
    } catch (patchError) {
      console.error(
        "[automations] failed to record error status",
        patchError,
      );
    }
    return { success: false, status: "error", error: message };
  }
}
