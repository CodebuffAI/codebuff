"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { PAUSE_REASON_VALIDATOR } from "./constants";
import { changeDeploymentStateWithTeamToken } from "./convex_management";

/**
 * Check if a user is paused and attempt to unpause them if they have sufficient credits.
 * This is used to gate critical user actions like creating projects or sending messages.
 *
 * @returns Object with canProceed (boolean) and optional message (string)
 */
export const checkAndUnpauseUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    canProceed: boolean;
    unpaused?: boolean;
    message?: string;
  }> => {
    // Check if user is currently paused
    const pauseStatus = await ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      {
        userId: args.userId,
      },
    );

    // User is not paused - can proceed
    if (!pauseStatus) {
      return {
        canProceed: true,
      };
    }

    // User is paused - attempt to unpause
    console.log(
      `User ${args.userId} is paused (reason: ${pauseStatus.pauseReason}), attempting to unpause...`,
    );

    const unpauseResult: any = await ctx.runAction(
      internal.deployment_management.unpauseUserDeployments,
      {
        userId: args.userId,
      },
    );

    if (unpauseResult.success && unpauseResult.unpaused) {
      console.log(
        `Successfully unpaused user ${args.userId}, they can now proceed`,
      );
      return {
        canProceed: true,
        unpaused: true,
        message: `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? "s" : ""}...`,
      };
    }

    // Could not unpause - block the action
    const errorMessage =
      unpauseResult.message ||
      "Your Convex deployments are paused. Please add more Convex credits to continue.";

    console.log(`Cannot unpause user ${args.userId}: ${errorMessage}`);

    return {
      canProceed: false,
      message: errorMessage,
    };
  },
});

/**
 * Pause a single project's Convex deployments
 */
export const pauseProjectDeployments = internalAction({
  args: {
    projectId: v.id("project"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    pausedBy: v.id("users"),
  },
  handler: async (ctx, args): Promise<any> => {
    console.log(
      `Pausing deployments for project ${args.projectId} due to ${args.pauseReason}`,
    );

    // Get project and convex instance directly
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const convexInstance = await ctx.runQuery(
      internal.project.getConvexInstanceInternal,
      {
        projectId: args.projectId,
      },
    );

    if (!convexInstance) {
      return {
        success: false,
        message: "Project has no Convex deployments",
        totalDeployments: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      };
    }

    // Build operations for dev and prod deployments
    const operations: Array<() => Promise<any>> = [];
    const results: any[] = [];

    // Dev deployment
    if (convexInstance.devDeploymentName) {
      operations.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            convexInstance.devDeploymentName,
            "paused",
          );
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: convexInstance.devDeploymentName,
            type: "dev",
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: convexInstance.devDeploymentName,
            type: "dev",
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      });
    }

    // Prod deployment (if different from dev)
    if (
      convexInstance.prodDeploymentName &&
      convexInstance.prodDeploymentName !== convexInstance.devDeploymentName
    ) {
      const prodDeploymentName = convexInstance.prodDeploymentName; // Capture for closure
      operations.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            prodDeploymentName,
            "paused",
          );
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: prodDeploymentName,
            type: "prod",
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: prodDeploymentName,
            type: "prod",
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      });
    }

    // Execute operations in parallel
    const operationResults = await Promise.all(operations.map((op) => op()));
    results.push(...operationResults);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `Paused ${successCount} deployment(s) for project ${args.projectId}`,
    );

    // If successful, create a pause record in the database
    if (successCount > 0) {
      await ctx.runMutation(
        internal.deployment_queries.createProjectPauseRecord,
        {
          projectId: args.projectId,
          pauseReason: args.pauseReason,
          pausedBy: args.pausedBy,
        },
      );
    }

    return {
      success: successCount > 0,
      message:
        successCount > 0
          ? `Paused ${successCount} deployment(s)`
          : "Failed to pause any deployments",
      totalDeployments: results.length,
      successCount,
      failureCount,
      results,
    };
  },
});

/**
 * Unpause a single project's Convex deployments
 */
export const unpauseProjectDeployments = internalAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<any> => {
    console.log(`Unpausing deployments for project ${args.projectId}`);

    // Get project and convex instance directly
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const convexInstance = await ctx.runQuery(
      internal.project.getConvexInstanceInternal,
      {
        projectId: args.projectId,
      },
    );

    if (!convexInstance) {
      return {
        success: false,
        message: "Project has no Convex deployments",
        totalDeployments: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      };
    }

    // Build operations for dev and prod deployments
    const operations: Array<() => Promise<any>> = [];
    const results: any[] = [];

    // Dev deployment
    if (convexInstance.devDeploymentName) {
      operations.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            convexInstance.devDeploymentName,
            "running",
          );
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: convexInstance.devDeploymentName,
            type: "dev",
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: convexInstance.devDeploymentName,
            type: "dev",
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      });
    }

    // Prod deployment (if different from dev)
    if (
      convexInstance.prodDeploymentName &&
      convexInstance.prodDeploymentName !== convexInstance.devDeploymentName
    ) {
      const prodDeploymentName = convexInstance.prodDeploymentName; // Capture for closure
      operations.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            prodDeploymentName,
            "running",
          );
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: prodDeploymentName,
            type: "prod",
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          return {
            projectId: args.projectId,
            projectName: project.name || project.semantic_identifier,
            deploymentName: prodDeploymentName,
            type: "prod",
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      });
    }

    // Execute operations in parallel
    const operationResults = await Promise.all(operations.map((op) => op()));
    results.push(...operationResults);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `Unpaused ${successCount} deployment(s) for project ${args.projectId}`,
    );

    // If successful, mark the pause record as unpaused
    if (successCount > 0) {
      await ctx.runMutation(internal.deployment_queries.unpauseProjectRecord, {
        projectId: args.projectId,
      });
    }

    return {
      success: successCount > 0,
      message:
        successCount > 0
          ? `Unpaused ${successCount} deployment(s)`
          : "Failed to unpause any deployments",
      totalDeployments: results.length,
      successCount,
      failureCount,
      results,
    };
  },
});
