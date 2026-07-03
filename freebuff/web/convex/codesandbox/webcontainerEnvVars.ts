import { v } from "convex/values";

import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { internalMutation, internalQuery, query } from "../_generated/server";

/**
 * Durable storage for user-defined FRONTEND env vars of WebContainer-backed
 * projects. The container's `.env.local` is rebuilt on every boot and excluded
 * from snapshots, so these are persisted here and merged into `.env.local`
 * client-side (on boot and reactively on change).
 *
 * CONVEX_DEPLOY_KEY is explicitly banned: it's a credential minted fresh on
 * every boot by `provisionConvexForWebContainerProject` and must never be
 * user-settable or persisted.
 */

const BANNED_KEYS = new Set(["CONVEX_DEPLOY_KEY"]);

function assertValidKeys(vars: Record<string, string>) {
  for (const key of Object.keys(vars)) {
    if (BANNED_KEYS.has(key.toUpperCase())) {
      throw new Error(`"${key}" is managed by the platform and cannot be set.`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment variable key: "${key}"`);
    }
  }
}

export const getForProject = internalQuery({
  args: { projectId: v.id("project") },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("webcontainer_env_vars")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    return record?.vars ?? {};
  },
});

/** Merge-upserts vars into the project's frontend env var record. */
export const setForProject = internalMutation({
  args: {
    projectId: v.id("project"),
    vars: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    assertValidKeys(args.vars);
    const record = await ctx.db
      .query("webcontainer_env_vars")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (record) {
      await ctx.db.patch(record._id, {
        vars: { ...record.vars, ...args.vars },
      });
    } else {
      await ctx.db.insert("webcontainer_env_vars", {
        projectId: args.projectId,
        vars: args.vars,
      });
    }
  },
});

export const deleteKeyForProject = internalMutation({
  args: {
    projectId: v.id("project"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("webcontainer_env_vars")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!record || record.vars[args.key] === undefined) return;
    const next = { ...record.vars };
    delete next[args.key];
    await ctx.db.patch(record._id, { vars: next });
  },
});

/**
 * Client-facing reactive query used by the WebContainer boot/sync code to keep
 * the container's `.env.local` in sync with the stored frontend vars.
 */
export const getFrontendEnvVarsForContainer = query({
  args: { semanticIdentifier: v.string() },
  returns: v.union(v.record(v.string(), v.string()), v.null()),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) return null;

    const record = await ctx.db
      .query("webcontainer_env_vars")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .first();
    return record?.vars ?? {};
  },
});
