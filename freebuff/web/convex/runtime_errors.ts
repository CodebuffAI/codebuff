import { internal } from "!/_generated/api";
import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from "!/_generated/server";
import { v } from "convex/values";

export const processRuntimeError = httpAction(async (ctx, request) => {
  const body = await request.json();

  const project = await ctx.runQuery(
    internal.project.getProjectFromIdentifier,
    {
      semanticIdentifier: body.projectSemanticIdentifier,
    },
  );

  console.log("Project found", project?._id);

  if (!project) {
    return new Response("Project not found", { status: 500 });
  }

  const urlPath = new URL(body.url).pathname;

  await ctx.runMutation(internal.runtime_errors.logRuntimeError, {
    projectId: project._id,
    error: body.error,
    stack_trace: body.stackTrace,
    url: urlPath,
    filename: body.filename || undefined,
    lineno: body.lineno || undefined,
    colno: body.colno || undefined,
  });

  return new Response("OK", {
    status: 201,
    headers: {
      "Access-Control-Allow-Origin": "*",
      Vary: "origin",
    },
  });
});

export const logRuntimeError = internalMutation({
  args: {
    projectId: v.id("project"),
    error: v.string(),
    stack_trace: v.optional(v.string()),
    url: v.string(),
    filename: v.optional(v.string()),
    lineno: v.optional(v.number()),
    colno: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { projectId, error, stack_trace, url, filename, lineno, colno } =
      args;
    const date = Date.now();
    await ctx.db.insert("runtime_error", {
      projectId,
      error,
      stack_trace,
      date,
      url,
      filename,
      lineno,
      colno,
      status: "unresolved",
    });
  },
});

export const getUnresolvedRuntimeErrors = query({
  args: {
    projectId: v.id("project"),
    paginationOpts: v.optional(
      v.object({
        numItems: v.number(),
        cursor: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { projectId, paginationOpts } = args;

    // Use compound index for much better performance
    const results = await ctx.db
      .query("runtime_error")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", projectId).eq("status", "unresolved"),
      )
      .paginate(
        paginationOpts
          ? {
              numItems: paginationOpts.numItems,
              cursor: paginationOpts.cursor ?? null,
            }
          : { numItems: 100, cursor: null },
      );

    // For backward compatibility, also get errors with undefined status
    // Note: We can't easily combine paginated results, so we prioritize new errors
    // Legacy errors (status: undefined) should be migrated to "unresolved"
    if (results.page.length < (paginationOpts?.numItems ?? 100)) {
      const legacyResults = await ctx.db
        .query("runtime_error")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", undefined),
        )
        .filter((q) => q.eq(q.field("resolved"), undefined))
        .take((paginationOpts?.numItems ?? 100) - results.page.length);

      return {
        ...results,
        page: [...results.page, ...legacyResults],
      };
    }

    return results;
  },
});

export const deleteRuntimeError = mutation({
  args: {
    errorId: v.id("runtime_error"),
  },
  handler: async (ctx, { errorId }) => {
    await ctx.db.delete(errorId);
  },
});

export const resolveRuntimeErrors = mutation({
  args: {
    errorIds: v.array(v.id("runtime_error")),
  },
  handler: async (ctx, { errorIds }) => {
    for (const id of errorIds) {
      await ctx.db.patch(id, {
        resolved: true,
        status: "resolved",
      });
    }
  },
});

export const dismissRuntimeErrors = mutation({
  args: {
    errorIds: v.array(v.id("runtime_error")),
  },
  handler: async (ctx, { errorIds }) => {
    for (const id of errorIds) {
      await ctx.db.patch(id, {
        resolved: true,
        status: "dismissed",
      });
    }
  },
});

export const invalidateAllRuntimeErrors = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unresolvedErrors = await ctx.db
      .query("runtime_error")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "unresolved"),
          q.and(
            q.eq(q.field("status"), undefined),
            q.eq(q.field("resolved"), undefined),
          ),
        ),
      )
      .collect();

    for (const error of unresolvedErrors) {
      await ctx.db.patch(error._id, {
        resolved: true,
        status: "invalidated",
      });
    }

    console.log(
      `[RuntimeErrors] Invalidated ${unresolvedErrors.length} runtime errors for project ${args.projectId}`,
    );
  },
});
