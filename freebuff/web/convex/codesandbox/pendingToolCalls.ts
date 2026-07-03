import { v } from "convex/values";

import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { internal } from "../_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";

export const enqueueToolCall = internalMutation({
  args: {
    runId: v.string(),
    projectId: v.id("project"),
    toolName: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pending_tool_calls", {
      runId: args.runId,
      projectId: args.projectId,
      toolName: args.toolName,
      input: args.input,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const getToolCallById = internalQuery({
  args: { callId: v.id("pending_tool_calls") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.callId);
  },
});

export const getPendingToolCallsForProject = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project) return [];

    const access = await getVerifiedAccessProject(
      ctx,
      user._id,
      project.semantic_identifier,
    );
    if (!access) return [];

    return await ctx.db
      .query("pending_tool_calls")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending"),
      )
      .collect();
  },
});

/** Returns only pending tool calls for a specific agent run. */
export const getPendingToolCallsForRun = query({
  args: { projectId: v.id("project"), runId: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project) return [];

    const access = await getVerifiedAccessProject(
      ctx,
      user._id,
      project.semantic_identifier,
    );
    if (!access) return [];

    return await ctx.db
      .query("pending_tool_calls")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const failToolCall = internalMutation({
  args: {
    callId: v.id("pending_tool_calls"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.status !== "pending") return;
    await ctx.db.patch(args.callId, { status: "error", error: args.error });
  },
});

export const completeToolCall = mutation({
  args: {
    callId: v.id("pending_tool_calls"),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Authentication required.");
    }

    const call = await ctx.db.get(args.callId);
    if (!call || call.status !== "pending") {
      return;
    }

    const project = await ctx.db.get(call.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const access = await getVerifiedAccessProject(
      ctx,
      user._id,
      project.semantic_identifier,
    );
    if (!access) {
      throw new Error("Access denied.");
    }

    await ctx.db.patch(args.callId, {
      status: args.error ? "error" : "done",
      output: args.output,
      error: args.error,
    });
  },
});
