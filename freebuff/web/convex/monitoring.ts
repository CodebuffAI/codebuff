"use node";

import { Axiom } from "@axiomhq/js";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getAuthUser } from "./users";
import {
  calculateCosts,
  type CostBreakdown,
  type UsageMetrics,
} from "./lib/convex_pricing";
import { createDeployKey, ensureWebhookConfigured } from "./convex_management";
import { initializeCodebase } from "../codebase-utils/codebase/initializeCodebase";
import {
  hasSandboxStats,
  type SandboxStats,
} from "../codebase-utils/codebase/Codebase";

/**
 * Sanitizes a string for safe use in APL queries by escaping single quotes.
 * APL/KQL uses doubled single quotes ('') to represent a literal single quote within a string literal.
 * Also validates that the deployment name matches expected Convex format.
 *
 * @param value - The string value to sanitize
 * @returns The sanitized string safe for interpolation into APL queries
 * @throws Error if the value contains suspicious patterns
 */
function sanitizeForAplQuery(value: string): string {
  // Validate deployment name format (Convex deployment names are alphanumeric with hyphens)
  // This is a defense-in-depth measure
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(
      `Invalid deployment name format: ${value}. Deployment names should only contain lowercase letters, numbers, and hyphens.`,
    );
  }

  // Escape single quotes by doubling them (APL/KQL string literal escaping)
  // This prevents breaking out of the string literal context
  return value.replace(/'/g, "''");
}

/**
 * Retry helper for transient errors (like 503)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error (503, network issues, etc.)
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("503") ||
          error.message.includes("Service Unavailable") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("network"));

      // If not retryable or out of retries, throw immediately
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms...`,
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError!;
}

function isAxiomMissingDatasetError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unable to find dataset") ||
    message.includes("dataset not found")
  );
}

/**
 * Fetches metrics for a single deployment from Axiom with retry logic
 */
async function fetchDeploymentMetrics(
  axiom: Axiom,
  deploymentName: string,
  options?: { startTime?: string; endTime?: string },
) {
  const sanitizedName = sanitizeForAplQuery(deploymentName);

  // Build time filter if provided
  let timeFilter = "";
  if (options?.startTime || options?.endTime) {
    const conditions = [];
    if (options.startTime) {
      // APL datetime comparison uses ISO 8601 string literals
      conditions.push(`aggregated_at >= '${options.startTime}'`);
    }
    if (options.endTime) {
      conditions.push(`aggregated_at <= '${options.endTime}'`);
    }
    timeFilter =
      conditions.length > 0 ? `| where ${conditions.join(" and ")}` : "";
  }

  const apl = `
    ['convex-user-usage']
    | where deployment_name == '${sanitizedName}'
    ${timeFilter}
    | sort by aggregated_at desc
    | limit 1000
  `;

  const result = await retryWithBackoff(
    async () => await axiom.query(apl),
    3, // max 3 retries
    1000, // start with 1 second delay
  );
  const matches = result.matches || [];

  // Calculate aggregated metrics for this deployment
  let totalExecutions = 0;
  let totalExecutionTime = 0;
  let maxActionMemory = 0;
  let totalDbReadBytes = 0;
  let totalDbReadDocuments = 0;
  let totalDbWriteBytes = 0;
  let totalFileStorageReadBytes = 0;
  let totalFileStorageWriteBytes = 0;

  const timeSeriesData = matches.map((match: any) => {
    const data = match.data;
    totalExecutions += data.execution_count || 0;
    totalExecutionTime += data.execution_time_ms || 0;
    maxActionMemory = Math.max(
      maxActionMemory,
      data.action_memory_used_mb || 0,
    );
    totalDbReadBytes += data.db_read_bytes || 0;
    totalDbReadDocuments += data.db_read_documents || 0;
    totalDbWriteBytes += data.db_write_bytes || 0;
    totalFileStorageReadBytes += data.file_storage_read_bytes || 0;
    totalFileStorageWriteBytes += data.file_storage_write_bytes || 0;

    // Calculate costs for this time period
    const periodCosts = calculateCosts({
      executionCount: data.execution_count || 0,
      executionTimeMs: data.execution_time_ms || 0,
      actionMemoryUsedMb: data.action_memory_used_mb || 0,
      dbReadBytes: data.db_read_bytes || 0,
      dbWriteBytes: data.db_write_bytes || 0,
      fileStorageReadBytes: data.file_storage_read_bytes || 0,
      fileStorageWriteBytes: data.file_storage_write_bytes || 0,
    } satisfies UsageMetrics);

    return {
      timestamp: data.aggregated_at,
      executionCount: data.execution_count || 0,
      executionTimeMs: data.execution_time_ms || 0,
      avgExecutionTimeMs: data.avg_execution_time_ms || 0,
      actionMemoryUsedMb: data.action_memory_used_mb || 0,
      dbReadBytes: data.db_read_bytes || 0,
      dbReadDocuments: data.db_read_documents || 0,
      dbWriteBytes: data.db_write_bytes || 0,
      fileStorageReadBytes: data.file_storage_read_bytes || 0,
      fileStorageWriteBytes: data.file_storage_write_bytes || 0,
      costs: periodCosts,
    };
  });

  return {
    totalExecutions,
    totalExecutionTime,
    maxActionMemory,
    totalDbReadBytes,
    totalDbReadDocuments,
    totalDbWriteBytes,
    totalFileStorageReadBytes,
    totalFileStorageWriteBytes,
    timeSeriesData: timeSeriesData.reverse(), // Oldest to newest
    lastUpdated: matches.length > 0 ? matches[0].data.aggregated_at : null,
  };
}

/**
 * Merges time series data from multiple deployments by timestamp
 */
function _mergeTimeSeries(
  series1: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
  }>,
  series2: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
  }>,
) {
  // Create a map of timestamp to combined metrics
  const timeMap = new Map<
    string,
    {
      executionCount: number;
      executionTimeMs: number;
      actionMemoryUsedMb: number;
      dbReadBytes: number;
      dbReadDocuments: number;
      dbWriteBytes: number;
      fileStorageReadBytes: number;
      fileStorageWriteBytes: number;
    }
  >();

  // Add series1 data
  for (const point of series1) {
    timeMap.set(point.timestamp, {
      executionCount: point.executionCount,
      executionTimeMs: point.executionTimeMs,
      actionMemoryUsedMb: point.actionMemoryUsedMb,
      dbReadBytes: point.dbReadBytes,
      dbReadDocuments: point.dbReadDocuments,
      dbWriteBytes: point.dbWriteBytes,
      fileStorageReadBytes: point.fileStorageReadBytes,
      fileStorageWriteBytes: point.fileStorageWriteBytes,
    });
  }

  // Merge series2 data
  for (const point of series2) {
    const existing = timeMap.get(point.timestamp);
    if (existing) {
      // Combine metrics for the same timestamp
      existing.executionCount += point.executionCount;
      existing.executionTimeMs += point.executionTimeMs;
      existing.actionMemoryUsedMb = Math.max(
        existing.actionMemoryUsedMb,
        point.actionMemoryUsedMb,
      );
      existing.dbReadBytes += point.dbReadBytes;
      existing.dbReadDocuments += point.dbReadDocuments;
      existing.dbWriteBytes += point.dbWriteBytes;
      existing.fileStorageReadBytes += point.fileStorageReadBytes;
      existing.fileStorageWriteBytes += point.fileStorageWriteBytes;
    } else {
      // New timestamp
      timeMap.set(point.timestamp, {
        executionCount: point.executionCount,
        executionTimeMs: point.executionTimeMs,
        actionMemoryUsedMb: point.actionMemoryUsedMb,
        dbReadBytes: point.dbReadBytes,
        dbReadDocuments: point.dbReadDocuments,
        dbWriteBytes: point.dbWriteBytes,
        fileStorageReadBytes: point.fileStorageReadBytes,
        fileStorageWriteBytes: point.fileStorageWriteBytes,
      });
    }
  }

  // Convert back to array and sort by timestamp
  const merged = Array.from(timeMap.entries())
    .map(([timestamp, metrics]) => {
      const avgExecutionTimeMs =
        metrics.executionCount > 0
          ? metrics.executionTimeMs / metrics.executionCount
          : 0;

      const costs = calculateCosts({
        executionCount: metrics.executionCount,
        executionTimeMs: metrics.executionTimeMs,
        actionMemoryUsedMb: metrics.actionMemoryUsedMb,
        dbReadBytes: metrics.dbReadBytes,
        dbWriteBytes: metrics.dbWriteBytes,
        fileStorageReadBytes: metrics.fileStorageReadBytes,
        fileStorageWriteBytes: metrics.fileStorageWriteBytes,
      } satisfies UsageMetrics);

      return {
        timestamp,
        executionCount: metrics.executionCount,
        executionTimeMs: metrics.executionTimeMs,
        avgExecutionTimeMs,
        actionMemoryUsedMb: metrics.actionMemoryUsedMb,
        dbReadBytes: metrics.dbReadBytes,
        dbReadDocuments: metrics.dbReadDocuments,
        dbWriteBytes: metrics.dbWriteBytes,
        fileStorageReadBytes: metrics.fileStorageReadBytes,
        fileStorageWriteBytes: metrics.fileStorageWriteBytes,
        costs,
      };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return merged;
}

// Merge time series while preserving deployment type for stacked charts
function mergeTimeSeriesWithDeploymentType(
  devSeries: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
  }>,
  prodSeries: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
  }>,
) {
  // Collect all unique timestamps
  const allTimestamps = new Set<string>();
  devSeries.forEach((point) => allTimestamps.add(point.timestamp));
  prodSeries.forEach((point) => allTimestamps.add(point.timestamp));

  // Create a result array with separate entries for dev and prod
  const result: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
    deploymentType: "dev" | "prod";
  }> = [];

  // Add dev series data with deploymentType marker
  devSeries.forEach((point) => {
    result.push({
      ...point,
      deploymentType: "dev" as const,
    });
  });

  // Add prod series data with deploymentType marker
  prodSeries.forEach((point) => {
    result.push({
      ...point,
      deploymentType: "prod" as const,
    });
  });

  // Sort by timestamp (dev and prod entries with same timestamp will be adjacent)
  result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return result;
}

export const getUsageMetrics = action({
  args: {
    projectId: v.id("project"),
    deploymentType: v.union(
      v.literal("dev"),
      v.literal("prod"),
      v.literal("all"),
    ),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    deploymentName: string;
    deploymentType?: "dev" | "prod" | "all";
    devDeploymentName?: string;
    prodDeploymentName?: string;
    summary: {
      totalExecutions: number;
      avgExecutionTimeMs: number;
      totalActionMemoryMb: number;
      totalDbReadBytes: number;
      totalDbReadDocuments: number;
      totalDbWriteBytes: number;
      totalFileStorageReadBytes: number;
      totalFileStorageWriteBytes: number;
    };
    costs: CostBreakdown;
    timeSeries: Array<{
      timestamp: string;
      executionCount: number;
      executionTimeMs: number;
      avgExecutionTimeMs: number;
      actionMemoryUsedMb: number;
      dbReadBytes: number;
      dbReadDocuments: number;
      dbWriteBytes: number;
      fileStorageReadBytes: number;
      fileStorageWriteBytes: number;
      costs: CostBreakdown;
      deploymentType?: "dev" | "prod";
    }>;
    lastUpdated: string | null;
  }> => {
    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN!,
    });

    try {
      if (args.deploymentType === "all") {
        // Fetch dev and prod separately and combine
        const devDeploymentName = await ctx.runAction(
          api.database.convex.getConvexDeploymentName,
          {
            projectId: args.projectId,
            type: "dev",
          },
        );
        const prodDeploymentName = await ctx.runAction(
          api.database.convex.getConvexDeploymentName,
          {
            projectId: args.projectId,
            type: "prod",
          },
        );

        const timeOptions =
          args.startTime || args.endTime
            ? { startTime: args.startTime, endTime: args.endTime }
            : undefined;

        const [devMetrics, prodMetrics] = await Promise.all([
          fetchDeploymentMetrics(axiom, devDeploymentName, timeOptions),
          fetchDeploymentMetrics(axiom, prodDeploymentName, timeOptions),
        ]);

        // Combine metrics
        const totalExecutions =
          devMetrics.totalExecutions + prodMetrics.totalExecutions;
        const totalExecutionTime =
          devMetrics.totalExecutionTime + prodMetrics.totalExecutionTime;
        const maxActionMemory = Math.max(
          devMetrics.maxActionMemory,
          prodMetrics.maxActionMemory,
        );
        const totalDbReadBytes =
          devMetrics.totalDbReadBytes + prodMetrics.totalDbReadBytes;
        const totalDbReadDocuments =
          devMetrics.totalDbReadDocuments + prodMetrics.totalDbReadDocuments;
        const totalDbWriteBytes =
          devMetrics.totalDbWriteBytes + prodMetrics.totalDbWriteBytes;
        const totalFileStorageReadBytes =
          devMetrics.totalFileStorageReadBytes +
          prodMetrics.totalFileStorageReadBytes;
        const totalFileStorageWriteBytes =
          devMetrics.totalFileStorageWriteBytes +
          prodMetrics.totalFileStorageWriteBytes;

        // Merge time series while preserving deployment type for stacked charts
        const mergedTimeSeries = mergeTimeSeriesWithDeploymentType(
          devMetrics.timeSeriesData,
          prodMetrics.timeSeriesData,
        );

        // Calculate total costs
        const totalCosts = calculateCosts({
          executionCount: totalExecutions,
          executionTimeMs: totalExecutionTime,
          actionMemoryUsedMb: maxActionMemory,
          dbReadBytes: totalDbReadBytes,
          dbWriteBytes: totalDbWriteBytes,
          fileStorageReadBytes: totalFileStorageReadBytes,
          fileStorageWriteBytes: totalFileStorageWriteBytes,
        } satisfies UsageMetrics);

        const lastUpdated =
          devMetrics.lastUpdated && prodMetrics.lastUpdated
            ? devMetrics.lastUpdated > prodMetrics.lastUpdated
              ? devMetrics.lastUpdated
              : prodMetrics.lastUpdated
            : devMetrics.lastUpdated || prodMetrics.lastUpdated;

        return {
          deploymentName: "All Deployments",
          deploymentType: "all",
          devDeploymentName,
          prodDeploymentName,
          summary: {
            totalExecutions,
            avgExecutionTimeMs:
              totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
            totalActionMemoryMb: maxActionMemory,
            totalDbReadBytes,
            totalDbReadDocuments,
            totalDbWriteBytes,
            totalFileStorageReadBytes,
            totalFileStorageWriteBytes,
          },
          costs: totalCosts,
          timeSeries: mergedTimeSeries,
          lastUpdated,
        };
      } else {
        // Fetch single deployment
        const deploymentName = await ctx.runAction(
          api.database.convex.getConvexDeploymentName,
          {
            projectId: args.projectId,
            type: args.deploymentType,
          },
        );

        const timeOptions =
          args.startTime || args.endTime
            ? { startTime: args.startTime, endTime: args.endTime }
            : undefined;

        const metrics = await fetchDeploymentMetrics(
          axiom,
          deploymentName,
          timeOptions,
        );

        // Calculate total costs
        const totalCosts = calculateCosts({
          executionCount: metrics.totalExecutions,
          executionTimeMs: metrics.totalExecutionTime,
          actionMemoryUsedMb: metrics.maxActionMemory,
          dbReadBytes: metrics.totalDbReadBytes,
          dbWriteBytes: metrics.totalDbWriteBytes,
          fileStorageReadBytes: metrics.totalFileStorageReadBytes,
          fileStorageWriteBytes: metrics.totalFileStorageWriteBytes,
        } satisfies UsageMetrics);

        return {
          deploymentName,
          deploymentType: args.deploymentType as "dev" | "prod",
          summary: {
            totalExecutions: metrics.totalExecutions,
            avgExecutionTimeMs:
              metrics.totalExecutions > 0
                ? metrics.totalExecutionTime / metrics.totalExecutions
                : 0,
            totalActionMemoryMb: metrics.maxActionMemory,
            totalDbReadBytes: metrics.totalDbReadBytes,
            totalDbReadDocuments: metrics.totalDbReadDocuments,
            totalDbWriteBytes: metrics.totalDbWriteBytes,
            totalFileStorageReadBytes: metrics.totalFileStorageReadBytes,
            totalFileStorageWriteBytes: metrics.totalFileStorageWriteBytes,
          },
          costs: totalCosts,
          timeSeries: metrics.timeSeriesData,
          lastUpdated: metrics.lastUpdated,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[Monitoring] Error querying Axiom:", error);

      // Check if this is a service unavailability error
      if (
        errorMessage.includes("503") ||
        errorMessage.includes("Service Unavailable")
      ) {
        throw new Error(
          "Axiom monitoring service is temporarily unavailable. Please try again in a few moments.",
        );
      }

      // Check for authentication errors
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("Unauthorized")
      ) {
        throw new Error(
          "Authentication error with Axiom. Please check your API token configuration.",
        );
      }

      // Check for rate limiting
      if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        throw new Error(
          "Axiom rate limit exceeded. Please try again in a few minutes.",
        );
      }

      // Generic error
      throw new Error(
        `Failed to fetch usage metrics: ${errorMessage}. If this persists, please contact support.`,
      );
    }
  },
});

/**
 * Validates and ensures webhooks are configured for a project's Convex deployments.
 * This runs in the background when a project is loaded and does not block the user.
 *
 * For each deployment (dev and prod if it exists):
 * 1. Creates a temporary deploy key
 * 2. Checks if webhook is already configured
 * 3. Configures webhook if missing or inactive
 *
 * All operations are logged to console and errors don't throw - they're just logged.
 */
export const ensureProjectWebhooks = internalAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    console.log(
      `[WebhookValidator] Starting webhook validation for project ${args.projectId}`,
    );

    try {
      // Get the project's convex instance info
      const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
        projectId: args.projectId,
      });

      if (!convexInstance) {
        console.log(
          `[WebhookValidator] No convex instance found for project ${args.projectId}`,
        );
        return {
          success: false,
          message: "No convex instance found",
          results: [],
        };
      }

      const results: Array<{
        deploymentType: "dev" | "prod";
        deploymentName: string;
        success: boolean;
        action: "already_configured" | "configured" | "failed" | "skipped";
        message: string;
      }> = [];

      // Validate dev deployment webhook
      try {
        console.log(
          `[WebhookValidator] Checking dev deployment: ${convexInstance.devDeploymentName}`,
        );

        // Create a temporary deploy key for validation
        const devDeployKey = await createDeployKey(
          convexInstance.devDeploymentName,
          `webhook-validator-${Date.now()}`,
        );

        const devResult = await ensureWebhookConfigured(
          convexInstance.devDeploymentName,
          devDeployKey,
        );

        // Store the log stream ID if we got one
        if (devResult.logStreamId) {
          await ctx.runMutation(internal.convex_instance.updateLogStreamIds, {
            projectId: args.projectId,
            devLogStreamId: devResult.logStreamId,
          });
          console.log(
            `[WebhookValidator] Stored dev log stream ID: ${devResult.logStreamId}`,
          );
        }

        results.push({
          deploymentType: "dev",
          deploymentName: convexInstance.devDeploymentName,
          ...devResult,
        });

        console.log(
          `[WebhookValidator] Dev deployment result: ${devResult.action} - ${devResult.message}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[WebhookValidator] Error validating dev deployment:`,
          errorMessage,
        );
        results.push({
          deploymentType: "dev",
          deploymentName: convexInstance.devDeploymentName,
          success: false,
          action: "failed",
          message: `Error: ${errorMessage}`,
        });
      }

      // Validate prod deployment webhook if it exists
      if (convexInstance.prodDeploymentName) {
        try {
          console.log(
            `[WebhookValidator] Checking prod deployment: ${convexInstance.prodDeploymentName}`,
          );

          // Create a temporary deploy key for validation
          const prodDeployKey = await createDeployKey(
            convexInstance.prodDeploymentName,
            `webhook-validator-${Date.now()}`,
          );

          const prodResult = await ensureWebhookConfigured(
            convexInstance.prodDeploymentName,
            prodDeployKey,
          );

          // Store the log stream ID if we got one
          if (prodResult.logStreamId) {
            await ctx.runMutation(internal.convex_instance.updateLogStreamIds, {
              projectId: args.projectId,
              prodLogStreamId: prodResult.logStreamId,
            });
            console.log(
              `[WebhookValidator] Stored prod log stream ID: ${prodResult.logStreamId}`,
            );
          }

          results.push({
            deploymentType: "prod",
            deploymentName: convexInstance.prodDeploymentName,
            ...prodResult,
          });

          console.log(
            `[WebhookValidator] Prod deployment result: ${prodResult.action} - ${prodResult.message}`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[WebhookValidator] Error validating prod deployment:`,
            errorMessage,
          );
          results.push({
            deploymentType: "prod",
            deploymentName: convexInstance.prodDeploymentName,
            success: false,
            action: "failed",
            message: `Error: ${errorMessage}`,
          });
        }
      } else {
        console.log(
          `[WebhookValidator] No prod deployment exists for project ${args.projectId}`,
        );
        results.push({
          deploymentType: "prod",
          deploymentName: "N/A",
          success: true,
          action: "skipped",
          message: "No prod deployment exists",
        });
      }

      const allSuccessful = results.every((r) => r.success);
      console.log(
        `[WebhookValidator] Completed webhook validation for project ${args.projectId}. Success: ${allSuccessful}`,
      );

      return {
        success: allSuccessful,
        message: allSuccessful
          ? "All webhooks validated successfully"
          : "Some webhooks failed validation (check logs)",
        results,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[WebhookValidator] Unexpected error during webhook validation:`,
        errorMessage,
      );
      return {
        success: false,
        message: `Unexpected error: ${errorMessage}`,
        results: [],
      };
    }
  },
});

/**
 * Fetches current sandbox resource stats (CPU, memory, disk usage, etc.)
 * Only works for Daytona sandboxes that support the stats interface.
 */
export const getSandboxStats = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<SandboxStats | null> => {
    try {
      // Get the project to access sandbox ID
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      // Initialize codebase
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );

      // Check if this codebase supports stats
      if (!hasSandboxStats(codebase)) {
        console.log(
          `[SandboxStats] Sandbox ${project.sandbox_id} does not support stats`,
        );
        return null;
      }

      // Fetch stats
      const stats = await codebase.getStats();
      return stats;
    } catch (error) {
      console.error("[SandboxStats] Error fetching sandbox stats:", error);
      throw new Error(
        `Failed to fetch sandbox stats: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

export const getSandboxMetricsHistory = action({
  args: {
    projectId: v.id("project"),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sandboxId: string;
    timeSeries: Array<{
      timestamp: string;
      cpuUsagePercent: number;
      cpuLimitCores: number;
      memoryUsagePercent: number;
      memoryUsedBytes: number;
      memoryLimitBytes: number;
      diskUsagePercent: number;
      diskUsedBytes: number;
      diskSizeBytes: number;
      diskAvailableBytes: number;
      load1min: number;
      load5min: number;
      load15min: number;
    }>;
    startTime: string;
    endTime: string;
  }> => {
    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN!,
    });

    const now = new Date();
    const endTime = args.endTime ? new Date(args.endTime) : now;
    const startTime = args.startTime
      ? new Date(args.startTime)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    let sandboxId = "";

    try {
      // Get the project to access sandbox ID
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      sandboxId = project.sandbox_id;

      console.log(
        `[SandboxMetricsHistory] Fetching metrics for sandbox: ${sandboxId}`,
      );

      // Strip the "daytona:" prefix if present, as Axiom logs use just the UUID
      const sandboxUuid = sandboxId.startsWith("daytona:")
        ? sandboxId.replace("daytona:", "")
        : sandboxId;

      console.log(
        `[SandboxMetricsHistory] Using sandbox UUID for query: ${sandboxUuid}`,
      );

      // Build APL query for sandbox metrics
      const apl = `
        ['sandbox-user-usage']
        | where sandbox_id == '${sandboxUuid}'
        | sort by _time desc
        | limit 1000
      `;

      console.log(`[SandboxMetricsHistory] Running query:`, apl);

      const result = await retryWithBackoff(
        async () => await axiom.query(apl),
        3,
        1000,
      );

      const matches = result.matches || [];
      console.log(
        `[SandboxMetricsHistory] Found ${matches.length} raw matches`,
      );

      if (matches.length > 0) {
        console.log(`[SandboxMetricsHistory] Sample data:`, matches[0]?.data);
      }

      // Transform and filter the data into time series format
      const timeSeries = matches
        .map((match: any) => {
          const data = match.data;
          return {
            timestamp: data.timestamp,
            cpuUsagePercent: data.cpu_usage_percent || 0,
            cpuLimitCores: data.cpu_limit_cores || 0,
            memoryUsagePercent: data.memory_usage_percent || 0,
            memoryUsedBytes: data.memory_used_bytes || 0,
            memoryLimitBytes: data.memory_limit_bytes || 0,
            diskUsagePercent: data.disk_usage_percent || 0,
            diskUsedBytes: data.disk_used_bytes || 0,
            diskSizeBytes: data.disk_size_bytes || 0,
            diskAvailableBytes: data.disk_available_bytes || 0,
            load1min: data.load_1min || 0,
            load5min: data.load_5min || 0,
            load15min: data.load_15min || 0,
          };
        })
        .filter((point) => {
          const pointTime = new Date(point.timestamp).getTime();
          return (
            pointTime >= startTime.getTime() && pointTime <= endTime.getTime()
          );
        })
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      console.log(
        `[SandboxMetricsHistory] After filtering: ${timeSeries.length} points from ${startTime.toISOString()} to ${endTime.toISOString()}`,
      );

      return {
        sandboxId,
        timeSeries,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };
    } catch (error) {
      console.error("[SandboxMetricsHistory] Error fetching metrics:", error);

      // Check for authentication errors
      if (
        error instanceof Error &&
        (error.message.includes("401") || error.message.includes("403"))
      ) {
        throw new Error(
          "Authentication error with Axiom. Please check your API token configuration.",
        );
      }

      if (isAxiomMissingDatasetError(error)) {
        console.warn(
          "[SandboxMetricsHistory] Dataset 'sandbox-user-usage' not found; returning empty time series.",
        );
        return {
          sandboxId,
          timeSeries: [],
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        };
      }

      throw new Error(
        `Failed to fetch sandbox metrics history: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

/**
 * Get incident dashboard summary - error rates, affected users, top failing functions
 */
export const getIncidentDashboard = action({
  args: {
    dataset: v.optional(v.string()),
    timeRangeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      console.error(`[IncidentDashboard] Unauthorized access attempt`);
      throw new Error("Unauthorized: God role required");
    }

    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN_ADMIN!,
    });

    try {
      const dataset = args.dataset || "vly-convex";
      const timeRangeMs = args.timeRangeMs || 60 * 60 * 1000; // Default 1 hour

      const now = new Date();
      const startTime = new Date(now.getTime() - timeRangeMs);

      // convex-user-usage doesn't have individual failure events - return empty
      if (dataset === "convex-user-usage") {
        return {
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: now.toISOString(),
            durationMs: timeRangeMs,
          },
          summary: {
            totalErrors: 0,
            affectedDeploymentsCount: 0,
          },
          topFailingFunctions: [],
          affectedDeployments: [],
        };
      }

      // vly-convex dataset - detailed failure tracking
      // Query for total error count
      const errorCountApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | where ['data.status'] == 'failure'
        | summarize errorCount = count()
      `;

      const errorCountResult = await retryWithBackoff(
        async () => await axiom.query(errorCountApl),
        3,
        1000,
      );

      // Query for affected deployments
      const affectedUsersApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | extend deploymentName = ensure_field("convex.deployment_name", typeof(string))
        | where ['data.status'] == 'failure'
        | summarize errorCount = count() by deploymentName
        | order by errorCount desc
        | limit 10
      `;

      const affectedUsersResult = await retryWithBackoff(
        async () => await axiom.query(affectedUsersApl),
        3,
        1000,
      );

      // Query for top failing functions
      const topFailingApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | where ['data.status'] == 'failure'
        | summarize failureCount = count() by function_path
        | order by failureCount desc
        | limit 10
      `;

      const topFailingResult = await retryWithBackoff(
        async () => await axiom.query(topFailingApl),
        3,
        1000,
      );

      // Get total error count from buckets (summarize results go here, not in matches)
      const totalErrors =
        errorCountResult.buckets?.totals?.[0]?.aggregations?.find(
          (agg: any) => agg.op === "errorCount",
        )?.value || 0;

      // Format top failing functions - extract from buckets.totals where grouped results are stored
      const topFailingFunctions = (topFailingResult.buckets?.totals || [])
        .map((total: any) => {
          const functionPath = total.group?.function_path;
          const failureCount = total.aggregations?.find(
            (agg: any) => agg.op === "failureCount",
          )?.value;

          return {
            functionPath: functionPath || "unknown",
            failureCount: failureCount || 0,
          };
        })
        .filter((fn: any) => fn.functionPath !== "unknown")
        .sort((a: any, b: any) => b.failureCount - a.failureCount);

      // Format affected deployments - extract from buckets.totals where grouped results are stored
      const affectedDeployments = (affectedUsersResult.buckets?.totals || [])
        .map((total: any) => {
          const deploymentName = total.group?.deploymentName;
          const errorCount = total.aggregations?.find(
            (agg: any) => agg.op === "errorCount",
          )?.value;

          return {
            deploymentName: deploymentName || "unknown",
            errorCount: errorCount || 0,
          };
        })
        .filter((dep: any) => dep.deploymentName !== "unknown")
        .sort((a: any, b: any) => b.errorCount - a.errorCount);

      return {
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: now.toISOString(),
          durationMs: timeRangeMs,
        },
        summary: {
          totalErrors,
          affectedDeploymentsCount: affectedUsersResult.matches?.length || 0,
        },
        topFailingFunctions,
        affectedDeployments,
      };
    } catch (error) {
      console.error("[IncidentDashboard] Error querying Axiom:", error);
      throw new Error(
        `Failed to fetch incident dashboard: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

/**
 * Query Convex function logs from Axiom with filtering support
 * Supports time range, log level, text search, and pagination
 */
export const queryConvexLogs = action({
  args: {
    dataset: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    logLevels: v.optional(v.array(v.string())),
    searchText: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN_ADMIN!,
    });

    try {
      const dataset = args.dataset || "vly-convex";
      const limit = args.limit || 100;
      const offset = args.offset || 0;

      // Calculate time range - default to last 24 hours if not specified
      const now = new Date();
      const endTime = args.endTime ? new Date(args.endTime) : now;
      const startTime = args.startTime
        ? new Date(args.startTime)
        : new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

      // convex-user-usage contains aggregated metrics, not individual log entries
      if (dataset === "convex-user-usage") {
        return {
          logs: [],
          totalCount: 0,
          offset: 0,
          limit,
          hasMore: false,
          query: {
            dataset,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            logLevels: args.logLevels,
            searchText: args.searchText,
          },
        };
      }

      // Build APL query for Convex logs (vly-convex dataset)
      // Note: Field names contain dots (e.g., data.topic, data.log_level) and must be escaped with brackets
      const aplFilters: string[] = [];

      // Time range filter using _time
      aplFilters.push(
        `| where ['_time'] >= datetime('${startTime.toISOString()}')`,
      );
      aplFilters.push(
        `| where ['_time'] <= datetime('${endTime.toISOString()}')`,
      );

      // Filter by log level
      // Note: Convex logs use uppercase for log_level: "DEBUG", "INFO", "LOG", "WARN", "ERROR"
      // The UI passes lowercase values, so we need to convert them
      if (args.logLevels && args.logLevels.length > 0) {
        // Map lowercase to Convex's uppercase format
        // "info" -> "INFO", "LOG" (console.log also uses LOG)
        // "warn" -> "WARN"
        // "error" -> "ERROR"
        // "debug" -> "DEBUG"
        const levelMapping: Record<string, string[]> = {
          info: ["INFO", "LOG"],
          warn: ["WARN"],
          error: ["ERROR"],
          debug: ["DEBUG"],
        };

        const upperLevels = args.logLevels
          .flatMap((l) => levelMapping[l.toLowerCase()] || [])
          .map((l) => `'${l}'`)
          .join(", ");

        if (upperLevels) {
          // Build conditions for function_execution events based on selected levels
          // - "error" level → status == 'failure' OR has error_message
          // - "warn" level → has system_code
          // - "info" level → status == 'success' (without error_message or system_code)
          const functionExecutionConditions: string[] = [];

          if (args.logLevels.includes("error")) {
            functionExecutionConditions.push(
              "['data.status'] == 'failure' or isnotempty(['data.error_message'])",
            );
          }

          if (args.logLevels.includes("warn")) {
            functionExecutionConditions.push(
              "isnotempty(['data.system_code'])",
            );
          }

          if (args.logLevels.includes("info")) {
            functionExecutionConditions.push(
              "(['data.status'] == 'success' and isempty(['data.error_message']) and isempty(['data.system_code']))",
            );
          }

          // Build the complete filter
          const consoleFilter = `(['data.topic'] == 'console' and ['data.log_level'] in (${upperLevels}))`;
          const functionExecutionFilter =
            functionExecutionConditions.length > 0
              ? `(['data.topic'] == 'function_execution' and (${functionExecutionConditions.join(" or ")}))`
              : "";

          if (functionExecutionFilter) {
            aplFilters.push(
              `| where ${consoleFilter} or ${functionExecutionFilter}`,
            );
          } else {
            aplFilters.push(`| where ${consoleFilter}`);
          }
        }
      }

      // Search filter - search in multiple fields
      if (args.searchText && args.searchText.trim() !== "") {
        const escapedSearch = args.searchText.replace(/'/g, "''");
        aplFilters.push(
          `| where ['convex.deployment_name'] contains '${escapedSearch}' or ` +
            `['data.function.path'] contains '${escapedSearch}' or ` +
            `['data.message'] contains '${escapedSearch}' or ` +
            `['data.error_message'] contains '${escapedSearch}'`,
        );
      }

      // Build the APL query
      // Note: Axiom doesn't support skip, so we use take with a larger limit and slice client-side
      // For now, we'll just use limit and handle pagination by time ranges if needed
      const apl = `
        ['${dataset}']
        ${aplFilters.join("\n        ")}
        | order by ['_time'] desc
        | limit ${limit + offset}
      `;

      // Execute query with retry logic
      const result = await retryWithBackoff(
        async () => await axiom.query(apl),
        3,
        1000,
      );

      const allMatches = result.matches || [];

      // Apply offset client-side since Axiom doesn't support skip
      const matches = allMatches.slice(offset, offset + limit);

      // Get total count for pagination (run a separate count query)
      const countApl = `
        ['${dataset}']
        ${aplFilters.join("\n        ")}
        | summarize count()
      `;

      const countResult = await retryWithBackoff(
        async () => await axiom.query(countApl),
        3,
        1000,
      );

      const totalCount =
        countResult.matches?.[0]?.data?.["count_"] ??
        countResult.matches?.[0]?.data?.count ??
        matches.length;

      // Transform Convex logs to a consistent format
      const logs = matches.map((match: any) => {
        const record = match.data;
        const convexMeta = record.convex || {};
        const eventData = record.data || {};

        // Extract key fields from nested structure
        const topic = eventData.topic || "unknown";
        const logLevel = eventData.log_level || "info";
        const functionPath = eventData.function?.path || "unknown";
        const status = eventData.status || "success";
        const execTime = eventData.execution_time_ms || 0;
        const errorMessage = eventData.error_message || "";
        const logMessage = eventData.message || "";

        // Determine final level
        // Note: Convex uses uppercase log levels (ERROR, INFO, WARN, etc.)
        // We need to convert to lowercase for frontend consistency
        let level: "info" | "warn" | "error" | "debug" = "info";

        // First convert the raw log level to lowercase
        const normalizedLogLevel = logLevel.toLowerCase();
        if (["info", "warn", "error", "debug"].includes(normalizedLogLevel)) {
          level = normalizedLogLevel as "info" | "warn" | "error" | "debug";
        } else if (normalizedLogLevel === "log") {
          // Convex uses "LOG" for console.log, treat as info
          level = "info";
        }

        // Override based on execution status
        if (status === "failure" || errorMessage) {
          level = "error";
        } else if (eventData.system_code) {
          level = "warn";
        }

        // Build display message
        let message = "";
        if (topic === "function_execution") {
          message = `${functionPath} - ${status}`;
          if (execTime > 0) {
            message += ` (${execTime}ms)`;
          }
          if (errorMessage) {
            message += ` - ${errorMessage}`;
          }
        } else if (topic === "console" || logMessage) {
          message = logMessage;
          if (functionPath !== "unknown") {
            message = `[${functionPath}] ${message}`;
          }
        } else {
          message = JSON.stringify(eventData);
        }

        return {
          timestamp: record._time || eventData.timestamp,
          level,
          functionName: functionPath,
          deploymentName: convexMeta.deployment_name || "unknown",
          message,
          metadata: {
            topic,
            convex: convexMeta,
            status,
            execution_time_ms: execTime,
            ...eventData,
          },
          rawData: record,
        };
      });

      return {
        logs,
        totalCount,
        offset,
        limit,
        hasMore: offset + matches.length < totalCount,
        query: {
          dataset,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          logLevels: args.logLevels,
          searchText: args.searchText,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[QueryConvexLogs] Error querying logs:", error);

      // Check for service unavailability
      if (
        errorMessage.includes("503") ||
        errorMessage.includes("Service Unavailable")
      ) {
        throw new Error(
          "Axiom monitoring service is temporarily unavailable. Please try again in a few moments.",
        );
      }

      // Check for authentication errors
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("Unauthorized")
      ) {
        throw new Error(
          "Authentication error with Axiom. Please check your API token configuration.",
        );
      }

      // Check for rate limiting
      if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        throw new Error(
          "Axiom rate limit exceeded. Please try again in a few minutes.",
        );
      }

      // Generic error
      throw new Error(
        `Failed to query logs: ${errorMessage}. If this persists, please contact support.`,
      );
    }
  },
});

/**
 * Get Performance Dashboard data from Axiom
 * Includes: query cache hit rate, write conflicts, slowest functions, resource usage
 */
export const getPerformanceDashboard = action({
  args: {
    dataset: v.optional(v.string()),
    timeRangeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN_ADMIN!,
    });

    try {
      const dataset = args.dataset || "vly-convex";
      const timeRangeMs = args.timeRangeMs || 60 * 60 * 1000; // Default 1 hour

      const now = new Date();
      const startTime = new Date(now.getTime() - timeRangeMs);

      if (dataset === "convex-user-usage") {
        // convex-user-usage dataset - aggregated metrics only
        // We can show slowest functions and database read metrics, but not cache hit rate or write conflicts

        const slowestFunctionsApl = `
          ['${dataset}']
          | where todatetime(aggregated_at) >= datetime('${startTime.toISOString()}')
          | where todatetime(aggregated_at) <= datetime('${now.toISOString()}')
          | where event_type == "usage_summary"
          | summarize
              avgTime = avg(todouble(avg_execution_time_ms)),
              maxTime = max(todouble(avg_execution_time_ms)),
              execCount = sum(todouble(execution_count))
              by deployment_name
          | order by avgTime desc
          | limit 10
        `;

        const mostDocumentsReadApl = `
          ['${dataset}']
          | where todatetime(aggregated_at) >= datetime('${startTime.toISOString()}')
          | where todatetime(aggregated_at) <= datetime('${now.toISOString()}')
          | where event_type == "usage_summary"
          | summarize
              totalDocs = sum(todouble(db_read_documents)),
              totalBytes = sum(todouble(db_read_bytes))
              by deployment_name
          | order by totalDocs desc
          | limit 10
        `;

        const mostDataReadApl = `
          ['${dataset}']
          | where todatetime(aggregated_at) >= datetime('${startTime.toISOString()}')
          | where todatetime(aggregated_at) <= datetime('${now.toISOString()}')
          | where event_type == "usage_summary"
          | summarize
              totalDocs = sum(todouble(db_read_documents)),
              totalBytes = sum(todouble(db_read_bytes))
              by deployment_name
          | order by totalBytes desc
          | limit 10
        `;

        const [slowestFunctionsResult, mostDocumentsResult, mostDataResult] =
          await Promise.all([
            retryWithBackoff(() => axiom.query(slowestFunctionsApl), 3, 1000),
            retryWithBackoff(() => axiom.query(mostDocumentsReadApl), 3, 1000),
            retryWithBackoff(() => axiom.query(mostDataReadApl), 3, 1000),
          ]);

        // Parse results for convex-user-usage
        const parseSlowItemsUserUsage = (result: any) => {
          return (result.buckets?.totals || [])
            .map((total: any) => {
              const functionPath = total.group?.deployment_name;
              const avgTime = total.aggregations?.find(
                (agg: any) => agg.op === "avgTime",
              )?.value;
              const maxTime = total.aggregations?.find(
                (agg: any) => agg.op === "maxTime",
              )?.value;
              const execCount = total.aggregations?.find(
                (agg: any) => agg.op === "execCount",
              )?.value;

              return {
                functionPath: functionPath || "unknown",
                avgExecutionTimeMs: avgTime || 0,
                maxExecutionTimeMs: maxTime || 0,
                executionCount: execCount || 0,
              };
            })
            .filter((item: any) => item.functionPath !== "unknown")
            .sort(
              (a: any, b: any) => b.avgExecutionTimeMs - a.avgExecutionTimeMs,
            );
        };

        const parseResourceItemsUserUsage = (result: any) => {
          return (result.buckets?.totals || [])
            .map((total: any) => {
              const functionPath = total.group?.deployment_name;
              const totalDocs = total.aggregations?.find(
                (agg: any) => agg.op === "totalDocs",
              )?.value;
              const totalBytes = total.aggregations?.find(
                (agg: any) => agg.op === "totalBytes",
              )?.value;

              return {
                functionPath: functionPath || "unknown",
                totalDocumentsRead: totalDocs || 0,
                totalDataReadBytes: totalBytes || 0,
              };
            })
            .filter((item: any) => item.functionPath !== "unknown")
            .sort(
              (a: any, b: any) => b.totalDocumentsRead - a.totalDocumentsRead,
            );
        };

        const parseBandwidthItemsUserUsage = (result: any) => {
          return (result.buckets?.totals || [])
            .map((total: any) => {
              const functionPath = total.group?.deployment_name;
              const totalDocs = total.aggregations?.find(
                (agg: any) => agg.op === "totalDocs",
              )?.value;
              const totalBytes = total.aggregations?.find(
                (agg: any) => agg.op === "totalBytes",
              )?.value;

              return {
                functionPath: functionPath || "unknown",
                totalDocumentsRead: totalDocs || 0,
                totalDataReadBytes: totalBytes || 0,
              };
            })
            .filter((item: any) => item.functionPath !== "unknown")
            .sort(
              (a: any, b: any) => b.totalDataReadBytes - a.totalDataReadBytes,
            );
        };

        // Return results with empty arrays for unavailable metrics
        return {
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: now.toISOString(),
            durationMs: timeRangeMs,
          },
          queryCacheHitRate: {
            hitRate: 0,
            totalQueries: 0,
            cacheHits: 0,
            cacheMisses: 0,
          },
          writeConflicts: [],
          slowestQueries: parseSlowItemsUserUsage(slowestFunctionsResult),
          slowestMutations: [],
          slowestActions: [],
          mostDocumentsRead: parseResourceItemsUserUsage(mostDocumentsResult),
          mostDataRead: parseBandwidthItemsUserUsage(mostDataResult),
        };
      }

      // vly-convex dataset - detailed event data
      const cacheHitRateApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | where ['data.function.type'] == "query"
        | where isnotempty(['data.function.cached'])
        | summarize
            totalQueries = count(),
            cacheHits = countif(['data.function.cached']),
            cacheMisses = countif(not(['data.function.cached']))
      `;

      // Query 2: Write Conflicts (detected via OCC info)
      // NOTE: Use dcount(requestId) to count unique conflicts, not retry attempts.
      // Without deduplication, the same conflict retried 5 times would count as 5 conflicts.
      const writeConflictsApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend documentId = ensure_field("data.occ_info.document_id", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | extend requestId = ensure_field("data.request_id", typeof(string))
        | where isnotnull(documentId)
        | summarize conflictCount = dcount(requestId) by function_path, table_name = ['data.occ_info.table_name']
        | order by conflictCount desc
        | limit 10
      `;

      // Query 3: Slowest Queries
      const slowestQueriesApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | where ['data.function.type'] == "query"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | extend exec_time = todouble(['data.execution_time_ms'])
        | summarize avgTime = avg(exec_time), maxTime = max(exec_time), execCount = count() by function_path
        | order by avgTime desc
        | limit 10
      `;

      // Query 4: Slowest Mutations
      const slowestMutationsApl = slowestQueriesApl.replace(
        '"query"',
        '"mutation"',
      );

      // Query 5: Slowest Actions
      const slowestActionsApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | where ['data.function.type'] != "query" and ['data.function.type'] != "mutation"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | extend exec_time = todouble(['data.execution_time_ms'])
        | summarize avgTime = avg(exec_time), maxTime = max(exec_time), execCount = count() by function_path
        | order by avgTime desc
        | limit 10
      `;

      // Query 6: Most Documents Read
      const mostDocumentsReadApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | summarize totalDocs = sum(todouble(['data.usage.database_read_documents']))
            by function_path
        | order by totalDocs desc
        | limit 10
      `;

      // Query 7: Most Data Read (Bandwidth)
      const mostDataReadApl = `
        ['${dataset}']
        | where ['_time'] >= datetime('${startTime.toISOString()}')
        | where ['_time'] <= datetime('${now.toISOString()}')
        | where ['data.topic'] == "function_execution"
        | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
        | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                            strcat(normalized_component_path, "|")),
                                        ['data.function.path'])
        | summarize totalBytes = sum(todouble(['data.usage.database_read_bytes']))
            by function_path
        | order by totalBytes desc
        | limit 10
      `;

      // Execute all queries with retry logic
      const [
        cacheHitResult,
        writeConflictsResult,
        slowestQueriesResult,
        slowestMutationsResult,
        slowestActionsResult,
        mostDocumentsResult,
        mostDataResult,
      ] = await Promise.all([
        retryWithBackoff(() => axiom.query(cacheHitRateApl), 3, 1000),
        retryWithBackoff(() => axiom.query(writeConflictsApl), 3, 1000),
        retryWithBackoff(() => axiom.query(slowestQueriesApl), 3, 1000),
        retryWithBackoff(() => axiom.query(slowestMutationsApl), 3, 1000),
        retryWithBackoff(() => axiom.query(slowestActionsApl), 3, 1000),
        retryWithBackoff(() => axiom.query(mostDocumentsReadApl), 3, 1000),
        retryWithBackoff(() => axiom.query(mostDataReadApl), 3, 1000),
      ]);

      // Parse cache hit rate results
      const aggregations =
        cacheHitResult.buckets?.totals?.[0]?.aggregations || [];
      const totalQueries =
        aggregations.find((agg: any) => agg.op === "totalQueries")?.value || 0;
      const cacheHits =
        aggregations.find((agg: any) => agg.op === "cacheHits")?.value || 0;
      const cacheMisses =
        aggregations.find((agg: any) => agg.op === "cacheMisses")?.value || 0;

      const queryCacheHitRate = {
        hitRate: totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0,
        totalQueries,
        cacheHits,
        cacheMisses,
      };

      const _parseTopItems = (result: any, countField: string) => {
        return (result.buckets?.totals || [])
          .map((total: any) => {
            const functionPath = total.group?.function_path;
            const count = total.aggregations?.find(
              (agg: any) => agg.op === countField,
            )?.value;

            return {
              functionPath: functionPath || "unknown",
              count: count || 0,
            };
          })
          .filter((item: any) => item.functionPath !== "unknown")
          .sort((a: any, b: any) => b.count - a.count);
      };

      const parseWriteConflictItems = (result: any) => {
        return (result.buckets?.totals || [])
          .map((total: any) => {
            const functionPath = total.group?.function_path;
            const tableName = total.group?.table_name;
            const conflictCount = total.aggregations?.find(
              (agg: any) => agg.op === "conflictCount",
            )?.value;

            // Format as "function_path (table_name)" to show which table has conflicts
            const displayPath =
              functionPath && tableName
                ? `${functionPath} (${tableName})`
                : functionPath || "unknown";

            return {
              functionPath: displayPath,
              conflictCount: conflictCount || 0,
            };
          })
          .filter((item: any) => item.functionPath !== "unknown")
          .sort((a: any, b: any) => b.conflictCount - a.conflictCount);
      };

      const parseSlowItems = (result: any) => {
        return (result.buckets?.totals || [])
          .map((total: any) => {
            const functionPath = total.group?.function_path;
            const avgTime = total.aggregations?.find(
              (agg: any) => agg.op === "avgTime",
            )?.value;
            const maxTime = total.aggregations?.find(
              (agg: any) => agg.op === "maxTime",
            )?.value;
            const execCount = total.aggregations?.find(
              (agg: any) => agg.op === "execCount",
            )?.value;

            return {
              functionPath: functionPath || "unknown",
              avgExecutionTimeMs: avgTime || 0,
              maxExecutionTimeMs: maxTime || 0,
              executionCount: execCount || 0,
            };
          })
          .filter((item: any) => item.functionPath !== "unknown")
          .sort(
            (a: any, b: any) => b.avgExecutionTimeMs - a.avgExecutionTimeMs,
          );
      };

      const parseDocumentReadItems = (result: any) => {
        return (result.buckets?.totals || [])
          .map((total: any) => {
            const functionPath = total.group?.function_path;
            const totalDocs = total.aggregations?.find(
              (agg: any) => agg.op === "totalDocs",
            )?.value;

            return {
              functionPath: functionPath || "unknown",
              totalDocumentsRead: totalDocs || 0,
              totalDataReadBytes: 0, // Not queried in this result set
            };
          })
          .filter((item: any) => item.functionPath !== "unknown")
          .sort(
            (a: any, b: any) => b.totalDocumentsRead - a.totalDocumentsRead,
          );
      };

      const parseDataReadItems = (result: any) => {
        return (result.buckets?.totals || [])
          .map((total: any) => {
            const functionPath = total.group?.function_path;
            const totalBytes = total.aggregations?.find(
              (agg: any) => agg.op === "totalBytes",
            )?.value;

            return {
              functionPath: functionPath || "unknown",
              totalDocumentsRead: 0, // Not queried in this result set
              totalDataReadBytes: totalBytes || 0,
            };
          })
          .filter((item: any) => item.functionPath !== "unknown")
          .sort(
            (a: any, b: any) => b.totalDataReadBytes - a.totalDataReadBytes,
          );
      };

      return {
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: now.toISOString(),
          durationMs: timeRangeMs,
        },
        queryCacheHitRate,
        writeConflicts: parseWriteConflictItems(writeConflictsResult),
        slowestQueries: parseSlowItems(slowestQueriesResult),
        slowestMutations: parseSlowItems(slowestMutationsResult),
        slowestActions: parseSlowItems(slowestActionsResult),
        mostDocumentsRead: parseDocumentReadItems(mostDocumentsResult),
        mostDataRead: parseDataReadItems(mostDataResult),
      };
    } catch (error) {
      console.error("[PerformanceDashboard] Error querying Axiom:", error);
      throw new Error(
        `Failed to fetch performance dashboard: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

/**
 * Get Cost Dashboard data from Axiom
 * Includes: total executions, bandwidth, execution time, top cost contributors
 */
export const getCostDashboard = action({
  args: {
    dataset: v.optional(v.string()),
    timeRangeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Initialize Axiom client
    const axiom = new Axiom({
      token: process.env.AXIOM_API_TOKEN_ADMIN!,
    });

    try {
      const dataset = args.dataset || "vly-convex";
      const timeRangeMs = args.timeRangeMs || 60 * 60 * 1000; // Default 1 hour

      const now = new Date();
      const startTime = new Date(now.getTime() - timeRangeMs);

      // Different queries based on dataset type
      let summaryApl: string;
      let topCostFunctionsApl: string;

      if (dataset === "convex-user-usage") {
        // convex-user-usage has aggregated metrics at root level
        summaryApl = `
          ['${dataset}']
          | where todatetime(aggregated_at) >= datetime('${startTime.toISOString()}')
          | where todatetime(aggregated_at) <= datetime('${now.toISOString()}')
          | where event_type == "usage_summary"
          | summarize
              totalExec = sum(todouble(execution_count)),
              totalTime = sum(todouble(execution_time_ms)),
              totalDbRead = sum(todouble(db_read_bytes)),
              totalDbWrite = sum(todouble(db_write_bytes)),
              totalFileRead = sum(todouble(file_storage_read_bytes)),
              totalFileWrite = sum(todouble(file_storage_write_bytes)),
              totalComputeGBHours = sum(todouble(action_memory_used_mb) * todouble(execution_time_ms) / 1024.0 / 3600000.0)
        `;

        topCostFunctionsApl = `
          ['${dataset}']
          | where todatetime(aggregated_at) >= datetime('${startTime.toISOString()}')
          | where todatetime(aggregated_at) <= datetime('${now.toISOString()}')
          | where event_type == "usage_summary"
          | summarize
              execCount = sum(todouble(execution_count)),
              totalTime = sum(todouble(execution_time_ms)),
              totalDbRead = sum(todouble(db_read_bytes)),
              totalDbWrite = sum(todouble(db_write_bytes)),
              totalFileRead = sum(todouble(file_storage_read_bytes)),
              totalFileWrite = sum(todouble(file_storage_write_bytes)),
              totalComputeGBHours = sum(todouble(action_memory_used_mb) * todouble(execution_time_ms) / 1024.0 / 3600000.0)
              by deployment_name
          | order by execCount desc
          | limit 10
        `;
      } else {
        // vly-convex has nested structure under data.*
        summaryApl = `
          ['${dataset}']
          | where ['_time'] >= datetime('${startTime.toISOString()}')
          | where ['_time'] <= datetime('${now.toISOString()}')
          | where ['data.topic'] == "function_execution"
          | summarize
              totalExec = count(),
              totalTime = sum(todouble(['data.execution_time_ms'])),
              totalDbRead = sum(todouble(['data.usage.database_read_bytes'])),
              totalDbWrite = sum(todouble(['data.usage.database_write_bytes'])),
              totalFileRead = sum(todouble(['data.usage.file_storage_read_bytes'])),
              totalFileWrite = sum(todouble(['data.usage.file_storage_write_bytes'])),
              totalComputeGBHours = sum(todouble(['data.usage.memory_used_mb']) * todouble(['data.execution_time_ms']) / 1024.0 / 3600000.0)
        `;

        topCostFunctionsApl = `
          ['${dataset}']
          | where ['_time'] >= datetime('${startTime.toISOString()}')
          | where ['_time'] <= datetime('${now.toISOString()}')
          | where ['data.topic'] == "function_execution"
          | extend normalized_component_path = ensure_field("data.function.component_path", typeof(string))
          | extend function_path = strcat(iff(isnull(normalized_component_path), "",
                                              strcat(normalized_component_path, "|")),
                                          ['data.function.path'])
          | summarize
              execCount = count(),
              totalTime = sum(todouble(['data.execution_time_ms'])),
              totalDbRead = sum(todouble(['data.usage.database_read_bytes'])),
              totalDbWrite = sum(todouble(['data.usage.database_write_bytes'])),
              totalFileRead = sum(todouble(['data.usage.file_storage_read_bytes'])),
              totalFileWrite = sum(todouble(['data.usage.file_storage_write_bytes'])),
              totalComputeGBHours = sum(todouble(['data.usage.memory_used_mb']) * todouble(['data.execution_time_ms']) / 1024.0 / 3600000.0)
              by function_path
          | order by execCount desc
          | limit 10
        `;
      }

      // Execute queries with retry logic
      const [summaryResult, topCostResult] = await Promise.all([
        retryWithBackoff(() => axiom.query(summaryApl), 3, 1000),
        retryWithBackoff(() => axiom.query(topCostFunctionsApl), 3, 1000),
      ]);

      // Parse summary results with full usage metrics
      const summaryData =
        summaryResult.buckets?.totals?.[0]?.aggregations || [];
      const totalExecutions =
        summaryData.find((agg: any) => agg.op === "totalExec")?.value || 0;
      const totalExecutionTimeMs =
        summaryData.find((agg: any) => agg.op === "totalTime")?.value || 0;
      const totalDbReadBytes =
        summaryData.find((agg: any) => agg.op === "totalDbRead")?.value || 0;
      const totalDbWriteBytes =
        summaryData.find((agg: any) => agg.op === "totalDbWrite")?.value || 0;
      const totalFileReadBytes =
        summaryData.find((agg: any) => agg.op === "totalFileRead")?.value || 0;
      const totalFileWriteBytes =
        summaryData.find((agg: any) => agg.op === "totalFileWrite")?.value || 0;
      const totalComputeGBHours =
        summaryData.find((agg: any) => agg.op === "totalComputeGBHours")
          ?.value || 0;

      // Calculate total bandwidth (database + file storage)
      const totalBandwidthBytes =
        totalDbReadBytes +
        totalDbWriteBytes +
        totalFileReadBytes +
        totalFileWriteBytes;

      // Calculate actual costs using Convex pricing
      const pricing = {
        FUNCTION_CALLS_PER_MILLION: 2.0,
        COMPUTE_PER_GB_HOUR: 0.3,
        DATABASE_BANDWIDTH_PER_GB: 0.2,
        FILE_BANDWIDTH_PER_GB: 0.3,
      };

      const functionCallCost =
        (totalExecutions / 1_000_000) * pricing.FUNCTION_CALLS_PER_MILLION;
      const computeCost = totalComputeGBHours * pricing.COMPUTE_PER_GB_HOUR;
      const dbBandwidthGB = (totalDbReadBytes + totalDbWriteBytes) / 1024 ** 3;
      const dbBandwidthCost = dbBandwidthGB * pricing.DATABASE_BANDWIDTH_PER_GB;
      const fileBandwidthGB =
        (totalFileReadBytes + totalFileWriteBytes) / 1024 ** 3;
      const fileBandwidthCost = fileBandwidthGB * pricing.FILE_BANDWIDTH_PER_GB;
      const estimatedTotalCost =
        functionCallCost + computeCost + dbBandwidthCost + fileBandwidthCost;

      // Parse top cost functions with full metrics and cost calculations
      const topCostFunctions = (topCostResult.buckets?.totals || [])
        .map((total: any) => {
          // Handle different field names based on dataset
          const functionPath =
            dataset === "convex-user-usage"
              ? total.group?.deployment_name
              : total.group?.function_path;
          const execCount =
            total.aggregations?.find((agg: any) => agg.op === "execCount")
              ?.value || 0;
          const totalTime =
            total.aggregations?.find((agg: any) => agg.op === "totalTime")
              ?.value || 0;
          const dbReadBytes =
            total.aggregations?.find((agg: any) => agg.op === "totalDbRead")
              ?.value || 0;
          const dbWriteBytes =
            total.aggregations?.find((agg: any) => agg.op === "totalDbWrite")
              ?.value || 0;
          const fileReadBytes =
            total.aggregations?.find((agg: any) => agg.op === "totalFileRead")
              ?.value || 0;
          const fileWriteBytes =
            total.aggregations?.find((agg: any) => agg.op === "totalFileWrite")
              ?.value || 0;
          const computeGBHours =
            total.aggregations?.find(
              (agg: any) => agg.op === "totalComputeGBHours",
            )?.value || 0;

          // Calculate bandwidth
          const totalBandwidth =
            dbReadBytes + dbWriteBytes + fileReadBytes + fileWriteBytes;

          // Calculate costs for this function using actual usage data
          const functionCallCost =
            (execCount / 1_000_000) * pricing.FUNCTION_CALLS_PER_MILLION;
          const computeCost = computeGBHours * pricing.COMPUTE_PER_GB_HOUR;
          const dbBandwidthGB = (dbReadBytes + dbWriteBytes) / 1024 ** 3;
          const dbBandwidthCost =
            dbBandwidthGB * pricing.DATABASE_BANDWIDTH_PER_GB;
          const fileBandwidthGB = (fileReadBytes + fileWriteBytes) / 1024 ** 3;
          const fileBandwidthCost =
            fileBandwidthGB * pricing.FILE_BANDWIDTH_PER_GB;
          const estimatedCost =
            functionCallCost +
            computeCost +
            dbBandwidthCost +
            fileBandwidthCost;

          return {
            functionPath: functionPath || "unknown",
            executionCount: execCount,
            totalExecutionTimeMs: totalTime,
            totalBandwidthBytes: totalBandwidth,
            estimatedCost,
          };
        })
        .filter((fn: any) => fn.functionPath !== "unknown")
        .sort((a: any, b: any) => b.estimatedCost - a.estimatedCost);

      return {
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: now.toISOString(),
          durationMs: timeRangeMs,
        },
        summary: {
          totalExecutions,
          totalBandwidthBytes,
          totalExecutionTimeMs,
          estimatedTotalCost,
          costBreakdown: {
            functionCallsCost: functionCallCost,
            computeCost,
            computeGBHours: totalComputeGBHours,
            dbBandwidthCost,
            dbBandwidthGB,
            fileBandwidthCost,
            fileBandwidthGB,
          },
        },
        topCostFunctions,
      };
    } catch (error) {
      console.error("[CostDashboard] Error querying Axiom:", error);
      throw new Error(
        `Failed to fetch cost dashboard: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

/**
 * List available sandbox sessions for a project
 * Returns all active sessions and their commands
 * Only accessible to god-role users
 */
export const listSandboxSessions = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    sessions: Array<{
      sessionId: string;
      commands: Array<{
        commandId: string;
        command: string;
        isRunning: boolean;
      }>;
    }>;
    error?: string;
  }> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Get the project
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        return {
          success: false,
          sessions: [],
          error: "Project not found",
        };
      }

      // Initialize codebase to access sandbox
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );

      // Check if this is a Daytona sandbox that supports process/session APIs
      if (!("sandbox" in codebase) || !codebase.sandbox) {
        return {
          success: false,
          sessions: [],
          error: "Sandbox does not support sessions",
        };
      }

      const sandbox = codebase.sandbox as any;

      // Check if sandbox has process API
      if (!sandbox.process || !sandbox.process.listSessions) {
        return {
          success: false,
          sessions: [],
          error: "Sandbox does not support listing sessions",
        };
      }

      // Fetch all sessions
      const sessions = await sandbox.process.listSessions();

      // Transform to include session details
      const sessionDetails = sessions.map((session: any) => ({
        sessionId: session.sessionId,
        commands: (session.commands || []).map((cmd: any) => ({
          commandId: cmd.cmdId || cmd.id || "unknown",
          command: cmd.command || "unknown",
          isRunning: cmd.isRunning ?? true,
        })),
      }));

      return {
        success: true,
        sessions: sessionDetails,
      };
    } catch (error) {
      console.error("[listSandboxSessions] Error listing sessions:", error);
      return {
        success: false,
        sessions: [],
        error:
          error instanceof Error ? error.message : "Failed to list sessions",
      };
    }
  },
});

/**
 * Get sandbox session logs for a project
 * Fetches command logs from Daytona sandbox sessions
 * Only accessible to god-role users
 */
export const getSandboxSessionLogs = action({
  args: {
    projectId: v.id("project"),
    sessionId: v.optional(v.string()),
    commandId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    logs: Array<{
      sessionId: string;
      commandId: string;
      stdout: string;
      stderr: string;
      combined: string;
      timestamp: number;
    }>;
    error?: string;
  }> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Get the project
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        return {
          success: false,
          logs: [],
          error: "Project not found",
        };
      }

      // Initialize codebase to access sandbox
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );

      // Check if this is a Daytona sandbox that supports process/session APIs
      if (!("sandbox" in codebase) || !codebase.sandbox) {
        return {
          success: false,
          logs: [],
          error: "Sandbox does not support session logs",
        };
      }

      const sandbox = codebase.sandbox as any;

      // Check if sandbox has process API
      if (!sandbox.process || !sandbox.process.getSessionCommandLogs) {
        return {
          success: false,
          logs: [],
          error: "Sandbox does not support session command logs",
        };
      }

      // Fetch session logs
      // If specific sessionId and commandId provided, get those logs
      // Otherwise, we'd need to list sessions first - for now just return specific logs
      if (args.sessionId && args.commandId) {
        const logs = await sandbox.process.getSessionCommandLogs(
          args.sessionId,
          args.commandId,
        );

        return {
          success: true,
          logs: [
            {
              sessionId: args.sessionId,
              commandId: args.commandId,
              stdout: logs.stdout || "",
              stderr: logs.stderr || "",
              combined: (logs.stdout || "") + (logs.stderr || ""),
              timestamp: Date.now(),
            },
          ],
        };
      }

      // If no specific session/command provided, return empty for now
      // Could be enhanced to list all sessions and their commands
      return {
        success: true,
        logs: [],
        error: "Please provide sessionId and commandId to fetch logs",
      };
    } catch (error) {
      console.error("[getSandboxSessionLogs] Error fetching logs:", error);
      return {
        success: false,
        logs: [],
        error: error instanceof Error ? error.message : "Failed to fetch logs",
      };
    }
  },
});
