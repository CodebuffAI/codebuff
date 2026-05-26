"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { VersioningService } from "../services/VersioningService";

/**
 * Centralized checkpoint API that wraps existing version control
 */

export const createCheckpoint = internalAction({
  args: {
    projectId: v.id("project"),
    message: v.string(),
    messageId: v.optional(v.id("messages")),
  },
  returns: v.object({
    success: v.boolean(),
    checkpointId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    console.log(
      `[Checkpoint API] Creating checkpoint for project ${args.projectId} with message: "${args.message}"`,
    );

    const versioningService = new VersioningService(ctx);
    return await versioningService.createCheckpoint(
      args.projectId,
      args.message,
      args.messageId,
    );
  },
});

export const restoreCheckpoint = internalAction({
  args: {
    projectId: v.id("project"),
    checkpointId: v.string(), // This is actually the commit hash
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        return { success: false, error: "Project not found" };
      }

      const versioningService = new VersioningService(ctx);
      await versioningService.revertToCheckpoint(
        args.projectId,
        project.semantic_identifier,
        args.checkpointId,
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const listCheckpoints = internalAction({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<any[]> => {
    const versioningService = new VersioningService(ctx);
    return await versioningService.getCheckpoints(args.projectId);
  },
});
