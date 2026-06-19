/**
 * Pending Gravity Index integrations (V8 / database side).
 *
 * A Gravity conversion is only created by `report_integration` — the tracked
 * click never converts on its own. We record a pending integration when a
 * service is recommended (catalog "Integrate" click or an agent `gravity_index`
 * search) and later, when the user saves the required env var(s) in the Keys
 * tab, fire `report_integration` deterministically (see `gravity_report.ts`)
 * instead of hoping the model remembers to call it.
 *
 * This file holds only the database mutations/queries (default V8 runtime); the
 * Node-only action + outbound HTTP live in `gravity_report.ts`.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

/** Upsert a pending integration, replacing any existing UNREPORTED row for the
 *  same (project, slug) so the freshest search_id / env-var set wins. Rows that
 *  were already reported are left untouched and only re-armed for a genuinely
 *  new search_id, so saving keys again for a converted service doesn't
 *  double-report. */
export const recordPendingIntegrationInternal = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("users"),
    slug: v.string(),
    searchId: v.string(),
    requiredEnvVars: v.array(v.string()),
    source: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const searchId = args.searchId.trim();
    if (!slug || !searchId) return null;

    const requiredEnvVars = Array.from(
      new Set(
        args.requiredEnvVars
          .map((key) => key.trim())
          .filter((key) => key.length > 0),
      ),
    );

    const existing = await ctx.db
      .query("gravity_pending_integration")
      .withIndex("by_project_and_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", slug),
      )
      .collect();

    const unreported = existing.find((row) => row.reportedAt === undefined);
    if (unreported) {
      await ctx.db.patch(unreported._id, {
        userId: args.userId,
        searchId,
        requiredEnvVars,
        source: args.source,
        createdAt: Date.now(),
      });
      return null;
    }

    if (existing.some((row) => row.searchId === searchId)) return null;

    await ctx.db.insert("gravity_pending_integration", {
      projectId: args.projectId,
      userId: args.userId,
      slug,
      searchId,
      requiredEnvVars,
      source: args.source,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const listUnreportedByProject = internalQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("gravity_pending_integration")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows.filter((row) => row.reportedAt === undefined);
  },
});

export const markReported = internalMutation({
  args: { id: v.id("gravity_pending_integration") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { reportedAt: Date.now() });
    return null;
  },
});
