"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { changeDeploymentStateWithTeamToken } from "./convex_management";
import { getAuthUser } from "./users";
import { PAUSE_REASON_VALIDATOR, PauseReason } from "./constants";

/**
 * Map pause reason to Autumn feature ID
 */
function mapPauseReasonToFeatureId(reason: string): string {
  const mapping: Record<string, string> = {
    db_bandwidth_depleted: "convex_database_bw",
    compute_depleted: "convex_compute",
    db_storage_depleted: "convex_database_bw", // No separate storage feature, using db_bw
    file_bandwidth_depleted: "convex_file_bw",
    function_calls_depleted: "convex_function_calls",
  };
  return mapping[reason] || "convex_database_bw";
}

/**
 * Map Autumn feature ID to pause reason (reverse mapping)
 */
export function mapFeatureIdToPauseReason(
  featureId: string,
): PauseReason | null {
  const mapping: Record<string, PauseReason> = {
    convex_database_bw: "db_bandwidth_depleted",
    convex_compute: "compute_depleted",
    convex_file_bw: "file_bandwidth_depleted",
    convex_function_calls: "function_calls_depleted",
  };
  return mapping[featureId] || null;
}

type DeploymentResult = {
  projectId: Id<"project">;
  projectName: string;
  deploymentName: string;
  type: "dev" | "prod";
  success: boolean;
  message: string;
};

/**
 * Shared helper to change state of all user deployments
 * Used by both pause and unpause operations
 */
async function changeUserDeploymentsState(
  ctx: any,
  userId: Id<"users">,
  targetState: "paused" | "running",
  actionVerb: string,
): Promise<{
  totalDeployments: number;
  successCount: number;
  failureCount: number;
  results: DeploymentResult[];
}> {
  console.log(`${actionVerb} all deployments for user ${userId}`);

  // Get all user deployments
  const deployments = await ctx.runQuery(
    internal.deployment_queries.getUserDeployments,
    {
      userId,
    },
  );

  console.log(
    `Found ${deployments.length} projects with Convex deployments for user ${userId}`,
  );
  console.log(
    "Projects:",
    deployments.map((d: any) => ({
      name: d.projectName,
      dev: d.devDeploymentName,
      prod: d.prodDeploymentName,
    })),
  );

  // Build array of operations for parallel processing
  const operations = deployments.flatMap((deployment: any) => {
    const ops: Array<() => Promise<DeploymentResult>> = [];

    // Dev deployment operation
    if (deployment.devDeploymentName) {
      ops.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            deployment.devDeploymentName,
            targetState,
          );

          return {
            projectId: deployment.projectId,
            projectName: deployment.projectName,
            deploymentName: deployment.devDeploymentName,
            type: "dev" as const,
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            projectId: deployment.projectId,
            projectName: deployment.projectName,
            deploymentName: deployment.devDeploymentName,
            type: "dev" as const,
            success: false,
            message: `Error: ${errorMessage}`,
          };
        }
      });
    }

    // Prod deployment operation (if different from dev)
    if (
      deployment.prodDeploymentName &&
      deployment.prodDeploymentName !== deployment.devDeploymentName
    ) {
      const prodDeploymentName = deployment.prodDeploymentName; // Capture for closure
      ops.push(async () => {
        try {
          const result = await changeDeploymentStateWithTeamToken(
            prodDeploymentName,
            targetState,
          );

          return {
            projectId: deployment.projectId,
            projectName: deployment.projectName,
            deploymentName: prodDeploymentName,
            type: "prod" as const,
            success: result.success,
            message: result.message,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            projectId: deployment.projectId,
            projectName: deployment.projectName,
            deploymentName: prodDeploymentName,
            type: "prod" as const,
            success: false,
            message: `Error: ${errorMessage}`,
          };
        }
      });
    }

    return ops;
  });

  // Process in parallel batches of 10 to avoid overwhelming external APIs
  const BATCH_SIZE = 10;
  const results: DeploymentResult[] = [];

  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((op: () => Promise<DeploymentResult>) => op()),
    );
    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  console.log(
    `${actionVerb} complete: ${successCount} succeeded, ${failureCount} failed`,
  );

  return {
    totalDeployments: results.length,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Pause all Convex deployments for a user (admin only)
 */
export const pauseAllUserDeployments = internalAction({
  args: {
    userId: v.id("users"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    autoUnpauseEnabled: v.optional(v.boolean()),
    pausedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    console.log(
      `Pausing all deployments for user ${args.userId} due to ${args.pauseReason}`,
    );

    const autoUnpause = args.autoUnpauseEnabled ?? true;

    // Record the pause in paused_users table
    await ctx.runAction(internal.deployment_management.recordUserPause, {
      userId: args.userId,
      pauseReason: args.pauseReason,
      autoUnpauseEnabled: autoUnpause,
      pausedBy: args.pausedBy,
    });

    // Use shared function to pause all deployments
    return await changeUserDeploymentsState(
      ctx,
      args.userId,
      "paused",
      "Pausing",
    );
  },
});

/**
 * Unpause all Convex deployments for a user (admin only)
 */
export const unpauseAllUserDeployments = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Use shared function to unpause all deployments
    return await changeUserDeploymentsState(
      ctx,
      args.userId,
      "running",
      "Unpausing",
    );
  },
});

/**
 * Check all Convex resources for a user to see if they're available
 * Returns which resources are depleted (if any)
 */
export const checkAllConvexResources = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    allAvailable: boolean;
    depletedResources: Array<{
      featureId: string;
      available: boolean;
      error: string | null;
    }>;
    checks: Array<{
      featureId: string;
      available: boolean;
      error: string | null;
    }>;
  }> => {
    // Get user's Clerk ID for Autumn billing
    const user = await ctx.runQuery(internal.users.get, {
      userId: args.userId,
    });

    if (!user?.clerk_id) {
      throw new Error("User not found or missing Clerk ID");
    }

    const clerkId: string = user.clerk_id; // This is what Autumn uses for billing!

    console.log(
      `[checkAllConvexResources] Checking credits for clerkId: ${clerkId}`,
    );

    const resources: Array<string> = [
      "convex_database_bw",
      "convex_compute",
      "convex_file_bw",
      "convex_function_calls",
    ];

    // Check all resources in parallel
    const checks = await Promise.all(
      resources.map(
        async (
          featureId,
        ): Promise<{
          featureId: string;
          available: boolean;
          error: string | null;
        }> => {
          try {
            // Use checkInternal to bypass auth context and pass Clerk ID directly
            const checkResult = await ctx.runAction(
              internal.autumn.checkInternal,
              {
                featureId,
                clerkId,
              },
            );

            const { data, error } = checkResult;

            console.log(
              `[checkAllConvexResources] Feature ${featureId}: allowed=${data?.allowed}, error=${error}, data=`,
              JSON.stringify(data),
            );

            return {
              featureId,
              available: !error && data?.allowed === true,
              error: error
                ? typeof error === "string"
                  ? error
                  : error.message
                : null,
            };
          } catch (error) {
            console.log(
              `[checkAllConvexResources] Feature ${featureId} threw error:`,
              error,
            );
            return {
              featureId,
              available: false,
              error: String(error),
            };
          }
        },
      ),
    );

    const depletedResources = checks.filter((c) => !c.available);
    const allAvailable = depletedResources.length === 0;

    return {
      allAvailable,
      depletedResources,
      checks,
    };
  },
});

/**
 * Unpause user deployments that were automatically paused
 */
export const unpauseUserDeployments = internalAction({
  args: {
    userId: v.id("users"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    console.log(`Attempting to unpause deployments for user ${args.userId}`);

    // Check if user has an active pause record with auto-unpause enabled
    const pauseRecord = await ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      {
        userId: args.userId,
      },
    );

    if (!pauseRecord) {
      console.log(`No active pause record found for user ${args.userId}`);
      return {
        success: false,
        message: "No active pause found for this user",
        unpaused: false,
      };
    }

    if (!args.force && !pauseRecord.autoUnpauseEnabled) {
      console.log(
        `User ${args.userId} was manually paused, skipping auto-unpause`,
      );
      return {
        success: false,
        message: "User was manually paused and cannot be auto-unpaused",
        unpaused: false,
      };
    }

    if (!args.force) {
      console.log(`Checking all Convex resources for user ${args.userId}`);

      const resourceCheck = await ctx.runAction(
        internal.deployment_management.checkAllConvexResources,
        { userId: args.userId },
      );

      if (!resourceCheck.allAvailable) {
        const depletedList = resourceCheck.depletedResources
          .map((r: any) => r.featureId)
          .join(", ");

        console.log(
          `Cannot unpause user ${args.userId}: resources still depleted: ${depletedList}`,
        );

        return {
          success: false,
          message: `Cannot unpause: ${depletedList} still depleted`,
          unpaused: false,
          depletedResources: resourceCheck.depletedResources,
        };
      }
    }

    console.log(
      `${args.force ? "[Force] " : ""}All checks passed for user ${args.userId}, proceeding with unpause`,
    );

    // Mark the pause record as inactive
    await ctx.runMutation(internal.paused_users.deactivatePauseRecord, {
      pauseId: pauseRecord._id,
    });

    // Unpause all user deployments
    const result = await ctx.runAction(
      internal.deployment_management.unpauseAllUserDeployments,
      { userId: args.userId },
    );

    console.log(
      `Unpaused ${result.successCount} deployments for user ${args.userId}`,
    );

    return {
      success: true,
      message: `Successfully unpaused ${result.successCount} deployments`,
      unpaused: true,
      ...result,
    };
  },
});

/**
 * Record a user pause in the database (internal action)
 */
export const recordUserPause = internalAction({
  args: {
    userId: v.id("users"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    autoUnpauseEnabled: v.boolean(),
    pausedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Check if there's an existing active pause record
    const existingPause = await ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      {
        userId: args.userId,
      },
    );

    if (existingPause) {
      // Update existing record
      await ctx.runMutation(internal.paused_users.updatePauseRecord, {
        pauseId: existingPause._id,
        pauseReason: args.pauseReason,
        autoUnpauseEnabled: args.autoUnpauseEnabled,
        pausedBy: args.pausedBy,
      });
    } else {
      // Create new record
      await ctx.runMutation(internal.paused_users.createPauseRecord, {
        userId: args.userId,
        pauseReason: args.pauseReason,
        autoUnpauseEnabled: args.autoUnpauseEnabled,
        pausedBy: args.pausedBy,
      });
    }
  },
});

/**
 * Check all paused users and unpause if their resource limits are replenished
 * Runs daily via cron job
 */
export const checkAndUnpausePausedUsers = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    console.log("[Cron] Checking paused users for resource replenishment...");

    const pausedUsers = await ctx.runQuery(
      internal.deployment_queries.getPausedUsers,
    );

    const autoUnpausableUsers = pausedUsers.filter(
      (p: any) => p.autoUnpauseEnabled === true,
    );

    console.log(
      `[Cron] Found ${autoUnpausableUsers.length} auto-unpausable paused users`,
    );

    if (autoUnpausableUsers.length === 0) {
      return {
        totalChecked: 0,
        unpausedCount: 0,
        stillPausedCount: 0,
        errorCount: 0,
        results: [],
      };
    }

    // Process in parallel batches to avoid timeout
    const BATCH_SIZE = 5;
    const results: Array<{
      userId: Id<"users">;
      pauseReason: string;
      resourceChecked: string;
      resourceAvailable: boolean;
      unpauseAttempted: boolean;
      unpauseSuccess: boolean;
      message: string;
    }> = [];

    for (let i = 0; i < autoUnpausableUsers.length; i += BATCH_SIZE) {
      const batch = autoUnpausableUsers.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (pausedUser: any) => {
          const featureId = mapPauseReasonToFeatureId(pausedUser.pauseReason);

          try {
            const user = await ctx.runQuery(internal.users.get, {
              userId: pausedUser.userId,
            });

            if (!user?.clerk_id) {
              return {
                userId: pausedUser.userId,
                pauseReason: pausedUser.pauseReason,
                resourceChecked: featureId,
                resourceAvailable: false,
                unpauseAttempted: false,
                unpauseSuccess: false,
                message: "User not found or missing Clerk ID",
              };
            }

            const checkResult = await ctx.runAction(
              internal.autumn.checkInternal,
              { featureId, clerkId: user.clerk_id },
            );

            const { data, error } = checkResult;

            if (error) {
              const errorMessage =
                typeof error === "string" ? error : error.message;
              return {
                userId: pausedUser.userId,
                pauseReason: pausedUser.pauseReason,
                resourceChecked: featureId,
                resourceAvailable: false,
                unpauseAttempted: false,
                unpauseSuccess: false,
                message: `Error checking resource: ${errorMessage}`,
              };
            }

            const resourceAvailable = data?.allowed === true;

            if (resourceAvailable) {
              console.log(
                `[Cron] Resource ${featureId} is available for user ${pausedUser.userId}, unpausing...`,
              );

              const unpauseResult = await ctx.runAction(
                internal.deployment_management.unpauseUserDeployments,
                { userId: pausedUser.userId },
              );

              return {
                userId: pausedUser.userId,
                pauseReason: pausedUser.pauseReason,
                resourceChecked: featureId,
                resourceAvailable: true,
                unpauseAttempted: true,
                unpauseSuccess: unpauseResult.success,
                message: unpauseResult.message,
              };
            }

            return {
              userId: pausedUser.userId,
              pauseReason: pausedUser.pauseReason,
              resourceChecked: featureId,
              resourceAvailable: false,
              unpauseAttempted: false,
              unpauseSuccess: false,
              message: `Resource ${featureId} still depleted`,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error(
              `[Cron] Unexpected error processing user ${pausedUser.userId}:`,
              errorMessage,
            );
            return {
              userId: pausedUser.userId,
              pauseReason: pausedUser.pauseReason,
              resourceChecked: featureId,
              resourceAvailable: false,
              unpauseAttempted: false,
              unpauseSuccess: false,
              message: `Unexpected error: ${errorMessage}`,
            };
          }
        }),
      );

      results.push(...batchResults);
    }

    const unpausedCount = results.filter((r) => r.unpauseSuccess).length;
    const stillPausedCount = results.filter((r) => !r.resourceAvailable).length;
    const errorCount = results.filter(
      (r) => r.unpauseAttempted && !r.unpauseSuccess,
    ).length;

    console.log(
      `[Cron] Unpause check complete: ${unpausedCount} unpaused, ${stillPausedCount} still paused, ${errorCount} errors`,
    );

    return {
      totalChecked: autoUnpausableUsers.length,
      unpausedCount,
      stillPausedCount,
      errorCount,
      results,
    };
  },
});

/**
 * Pause current user's deployments (public action)
 */
export const pauseCurrentUserDeployments = action({
  args: {
    pauseReason: v.optional(PAUSE_REASON_VALIDATOR),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    totalDeployments: number;
    successCount: number;
    failureCount: number;
    results: Array<{
      projectId: Id<"project">;
      projectName: string;
      deploymentName: string;
      type: "dev" | "prod";
      success: boolean;
      message: string;
    }>;
  }> => {
    // Get authenticated user
    const user = await getAuthUser(ctx);

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Pause all user deployments with specified reason (default to manual_admin)
    const result: {
      totalDeployments: number;
      successCount: number;
      failureCount: number;
      results: Array<{
        projectId: Id<"project">;
        projectName: string;
        deploymentName: string;
        type: "dev" | "prod";
        success: boolean;
        message: string;
      }>;
    } = await ctx.runAction(
      internal.deployment_management.pauseAllUserDeployments,
      {
        userId: user._id,
        pauseReason: args.pauseReason || "manual_admin",
        autoUnpauseEnabled: args.pauseReason !== "manual_admin",
        pausedBy: user._id,
      },
    );

    return result;
  },
});

/**
 * Unpause current user's deployments (public action)
 * This is for MANUAL unpausing (e.g., from devtools or after adding credits)
 * It bypasses the autoUnpauseEnabled check since the user is explicitly requesting unpause
 */
export const unpauseCurrentUserDeployments = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    // Get authenticated user
    const user = await getAuthUser(ctx);

    if (!user) {
      throw new Error("Not authenticated");
    }

    console.log(
      `Manual unpause requested for user ${user._id} (${user.email})`,
    );

    // Check if user has an active pause record
    const pauseRecord = await ctx.runQuery(
      internal.deployment_queries.getUserPauseStatusInternal,
      {
        userId: user._id,
      },
    );

    if (!pauseRecord) {
      console.log(`No active pause record found for user ${user._id}`);
      return {
        success: false,
        message: "No active pause found for this user",
        unpaused: false,
      };
    }

    // Check all resources before allowing manual unpause
    const resourceCheck = await ctx.runAction(
      internal.deployment_management.checkAllConvexResources,
      { userId: user._id },
    );

    if (!resourceCheck.allAvailable) {
      const depletedList = resourceCheck.depletedResources
        .map((r: any) => r.featureId)
        .join(", ");
      console.log(
        `Cannot manually unpause user ${user._id}: resources still depleted: ${depletedList}`,
      );
      return {
        success: false,
        message: `Cannot unpause: ${depletedList} still depleted`,
        unpaused: false,
        depletedResources: resourceCheck.depletedResources,
      };
    }

    // For manual unpause, deactivate the pause record regardless of autoUnpauseEnabled
    console.log(
      `Deactivating pause record for user ${user._id} (was: ${pauseRecord.pauseReason}, autoUnpause: ${pauseRecord.autoUnpauseEnabled})`,
    );

    await ctx.runMutation(internal.paused_users.deactivatePauseRecord, {
      pauseId: pauseRecord._id,
    });

    // Unpause all user deployments
    const result = await ctx.runAction(
      internal.deployment_management.unpauseAllUserDeployments,
      { userId: user._id },
    );

    console.log(
      `Manual unpause complete: ${result.successCount} deployments unpaused for user ${user._id}`,
    );

    return {
      success: true,
      message: `Successfully unpaused ${result.successCount} deployments`,
      unpaused: true,
      ...result,
    };
  },
});
