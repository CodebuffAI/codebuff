"use node";

/**
 * Deterministic Gravity Index conversion reporting (Node side).
 *
 * Fires `report_integration` once the user actually saves the required env
 * var(s) for a recommended service — the real conversion moment — instead of
 * relying on the agent to remember the call. The HTTP request goes through the
 * main app's `/api/v1/gravity-index` (which holds the Gravity API key) under the
 * Freebuff Web service account, passing the real end user as `external_user_id`
 * so the conversion attributes per-user rather than to the service account.
 *
 * Database reads/writes live in `gravity_integrations.ts` (V8 runtime).
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { extractGravitySearchResult } from "./gravity_parse";
import { getVerifiedAccessProject } from "./project";
import { getAuthUser } from "./users";

import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const GRAVITY_REPORT_SURFACE = "freebuff_web_keys";

function codebuffAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ??
    process.env.CODEBUFF_APP_URL ??
    "https://codebuff.com"
  );
}

/** POST report_integration to the main app's Gravity Index endpoint under the
 *  service account, attributing to the real end user. Best-effort: never throws
 *  (a failed report must not break saving env vars). Returns true on success. */
async function postReportIntegration(params: {
  searchId: string;
  slug: string;
  userId: string;
}): Promise<boolean> {
  const apiKey = process.env.CODEBUFF_API_KEY;
  if (!apiKey) {
    console.warn("[gravity] CODEBUFF_API_KEY missing; cannot report integration", {
      slug: params.slug,
    });
    return false;
  }

  try {
    const response = await fetch(`${codebuffAppUrl()}/api/v1/gravity-index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        action: "report_integration",
        search_id: params.searchId,
        integrated_slug: params.slug,
        external_user_id: params.userId,
        external_session_id: params.userId,
        metadata: { surface: GRAVITY_REPORT_SURFACE },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("[gravity] report_integration upstream failed", {
        slug: params.slug,
        status: response.status,
        body: body.slice(0, 300),
      });
      return false;
    }
    console.log("[gravity] report_integration sent", {
      slug: params.slug,
      searchId: params.searchId,
    });
    return true;
  } catch (error) {
    console.warn("[gravity] report_integration request errored", {
      slug: params.slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Given the set of env var keys a project now has set, fire report_integration
 * for any pending integration whose required env vars are all present. Best
 * effort and idempotent (rows are marked reported). Safe to call after every
 * env-var save.
 */
export async function reportCompletedIntegrations(
  ctx: ActionCtx,
  params: { projectId: Id<"project">; presentEnvKeys: Set<string> },
): Promise<void> {
  let pending: Array<{
    _id: Id<"gravity_pending_integration">;
    slug: string;
    searchId: string;
    requiredEnvVars: string[];
    userId: Id<"users">;
  }>;
  try {
    pending = await ctx.runQuery(
      internal.gravity_integrations.listUnreportedByProject,
      { projectId: params.projectId },
    );
  } catch (error) {
    console.warn("[gravity] failed to load pending integrations", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const row of pending) {
    // A service with no known required env vars can't be confirmed by a save.
    if (row.requiredEnvVars.length === 0) continue;
    const allPresent = row.requiredEnvVars.every((key) =>
      params.presentEnvKeys.has(key),
    );
    if (!allPresent) continue;

    const ok = await postReportIntegration({
      searchId: row.searchId,
      slug: row.slug,
      userId: row.userId,
    });
    if (ok) {
      await ctx.runMutation(internal.gravity_integrations.markReported, {
        id: row._id,
      });
    }
  }
}

/**
 * Capture a pending integration from a gravity_index search tool result emitted
 * during an agent run. Best-effort; tolerates partial/garbled payloads.
 */
export async function capturePendingIntegrationFromToolOutput(
  ctx: ActionCtx,
  params: {
    projectId: Id<"project">;
    userId: Id<"users">;
    output: unknown;
  },
): Promise<void> {
  try {
    const result = extractGravitySearchResult(params.output);
    if (!result) return;
    await ctx.runMutation(
      internal.gravity_integrations.recordPendingIntegrationInternal,
      {
        projectId: params.projectId,
        userId: params.userId,
        slug: result.slug,
        searchId: result.searchId,
        requiredEnvVars: result.requiredEnvVars,
        source: "agent_search",
      },
    );
  } catch (error) {
    console.warn(
      "[gravity] failed to capture pending integration from tool output",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
}

/**
 * Session-authed action the integration catalog calls when the user clicks
 * "Integrate". Records the pending integration so a later env-var save converts
 * it into a report_integration deterministically.
 */
export const recordPendingIntegration = action({
  args: {
    semanticIdentifier: v.string(),
    slug: v.string(),
    searchId: v.string(),
    requiredEnvVars: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) return null;

    await ctx.runMutation(
      internal.gravity_integrations.recordPendingIntegrationInternal,
      {
        projectId: project._id,
        userId: user._id,
        slug: args.slug,
        searchId: args.searchId,
        requiredEnvVars: args.requiredEnvVars,
        source: "catalog_integrate",
      },
    );
    return null;
  },
});
