"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DollarSign, Activity, Clock, Database } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, EmptyState } from "../shared";
import {
  MetricCard,
  TopCostItemsAccordion,
  CostBreakdownAccordion,
} from "./shared";
import type {
  CostDashboard,
  FunctionCostItem,
} from "@/lib/monitoring/monitoring-types";
import { TIME_RANGES } from "@/lib/monitoring/monitoring-constants";
import { Id } from "@/convex/_generated/dataModel";

interface CostTabContentProps {
  dataset: string;
  timeRange: string;
  refetchTrigger?: number;
  deploymentPauseStatus?: Map<
    string,
    { paused: boolean; projectId: Id<"project"> | null }
  >;
  onFetchPauseStatuses?: (deploymentNames: string[]) => Promise<void>;
  onPauseResume?: (
    deploymentName: string,
    projectId: Id<"project"> | null,
    isPaused: boolean,
  ) => Promise<void>;
}

export function CostTabContent({
  dataset,
  timeRange,
  refetchTrigger,
  deploymentPauseStatus,
  onFetchPauseStatuses,
  onPauseResume,
}: CostTabContentProps) {
  const [dashboardData, setDashboardData] = useState<CostDashboard | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDashboard = useAction(api.monitoring.getCostDashboard);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const timeRangeConfig = TIME_RANGES.find((tr) => tr.value === timeRange);
      const timeRangeMs = timeRangeConfig?.ms || 24 * 60 * 60 * 1000;

      const result = await getDashboard({
        dataset,
        timeRangeMs,
      });

      setDashboardData(result);

      // For user projects, fetch pause status for each deployment
      if (dataset === "convex-user-usage" && onFetchPauseStatuses) {
        // Collect all unique deployment names from the dashboard
        const deploymentNames = new Set<string>();

        result.topCostFunctions?.forEach((item) =>
          deploymentNames.add(item.functionPath),
        );

        await onFetchPauseStatuses(Array.from(deploymentNames));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch cost data";
      setError(errorMessage);
      console.error("Error fetching cost dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, dataset, getDashboard, onFetchPauseStatuses]);

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Refetch when parent triggers it
  useEffect(() => {
    if (refetchTrigger && refetchTrigger > 0) {
      fetchDashboard();
    }
  }, [refetchTrigger, fetchDashboard]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    return `$${cost.toFixed(4)}`;
  };

  const isUserProjects = dataset === "convex-user-usage";

  // Handle debug all button click - copy debugging info for all items
  const handleDebugAllClick = useCallback(() => {
    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    if (!dashboardData?.topCostFunctions.length) return;

    const debugMessage = `Please help me optimize these ${isUserProjects ? "projects" : "Convex functions"} to reduce costs:

# Overview
- **Time Period:** ${timeRangeLabel}
- **Total Functions/Projects:** ${dashboardData.topCostFunctions.length}
- **Total Executions:** ${dashboardData.summary.totalExecutions.toLocaleString()} calls
- **Total Execution Time:** ${formatMs(dashboardData.summary.totalExecutionTimeMs)}
- **Estimated Total Cost:** ${formatCost(dashboardData.summary.estimatedTotalCost)}

# Top Cost Contributors

${dashboardData.topCostFunctions
  .map(
    (item, idx) => `## ${idx + 1}. ${item.functionPath}
- **Executions:** ${item.executionCount.toLocaleString()} calls
- **Total Execution Time:** ${formatMs(item.totalExecutionTimeMs)}
- **Average Execution Time:** ${formatMs(item.totalExecutionTimeMs / Math.max(item.executionCount, 1))}
`,
  )
  .join("\n")}

# Cost Breakdown
Based on Convex Professional pricing:
- **Function Calls:** $2 per 1M executions
- **Compute:** $0.30 per GB-hour (memory × execution time)
- **Database Bandwidth:** $0.20 per GB (reads + writes)
- **File Bandwidth:** $0.30 per GB (reads + writes)

# Convex Optimization Best Practices

## Query Optimization
1. **Use Indexes:** Always query with \`.withIndex()\` instead of \`.filter()\` for better performance
2. **Limit Results:** Use \`.take(n)\` to limit query results and reduce bandwidth
3. **Paginate Large Datasets:** Implement cursor-based pagination for large result sets
4. **Cache Queries:** Query results are automatically cached when dependencies don't change

## Database Reads
1. **Minimize Document Reads:** Each document read counts toward bandwidth costs
2. **Batch Operations:** Read multiple documents in a single query when possible
3. **Use Selective Fields:** Only read the fields you need (Convex returns full documents)
4. **Avoid Unnecessary Queries:** Consolidate multiple queries into one when possible

## Function Execution
1. **Reduce Computation:** Move heavy processing to actions (they're cheaper)
2. **Debounce/Throttle:** Avoid excessive function calls from UI interactions
3. **Batch Updates:** Group multiple mutations into fewer calls
4. **Use Internal Functions:** Internal functions don't count as separate executions

## Actions vs Queries/Mutations
1. **Use Actions for External APIs:** Actions can call external services
2. **Actions for Heavy Compute:** Actions are better for CPU-intensive tasks
3. **Mutations for Database Writes:** Keep mutations focused on database operations
4. **Queries for Reads:** Queries benefit from automatic caching

## General Tips
1. **Monitor Cache Hit Rate:** High cache hit rates reduce execution costs
2. **Avoid Write Conflicts:** Use optimistic updates and proper transaction design
3. **Minimize File Storage I/O:** File bandwidth is more expensive than database
4. **Review Frequently Called Functions:** Focus optimization on high-volume functions

# Question
Please analyze these functions and provide specific optimization recommendations to reduce execution time, bandwidth usage, and overall costs. Which functions should I prioritize for optimization?`;

    navigator.clipboard
      .writeText(debugMessage)
      .then(() => {
        toast.success("Debug info for all items copied to clipboard!", {
          description:
            "Paste into your AI assistant to get optimization suggestions",
        });
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard");
      });
  }, [dashboardData, timeRange, isUserProjects, formatMs, formatCost]);

  // Handle debug button click - copy debugging info to clipboard
  const handleDebugClick = useCallback(
    (item: FunctionCostItem) => {
      const timeRangeLabel =
        TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
        "Last 24 hours";

      const debugMessage = `Please help me optimize this ${isUserProjects ? "project" : "Convex function"} to reduce costs:

## Function/Project Details
- **Name:** ${item.functionPath}
- **Time Period:** ${timeRangeLabel}

## Current Metrics
- **Total Executions:** ${item.executionCount.toLocaleString()} calls
- **Total Execution Time:** ${formatMs(item.totalExecutionTimeMs)}
- **Average Execution Time:** ${formatMs(item.totalExecutionTimeMs / Math.max(item.executionCount, 1))}

## Cost Breakdown
Based on Convex Professional pricing:
- **Function Calls:** $2 per 1M executions
- **Compute:** $0.30 per GB-hour (memory × execution time)
- **Database Bandwidth:** $0.20 per GB (reads + writes)
- **File Bandwidth:** $0.30 per GB (reads + writes)

## Convex Optimization Best Practices

### Query Optimization
1. **Use Indexes:** Always query with \`.withIndex()\` instead of \`.filter()\` for better performance
2. **Limit Results:** Use \`.take(n)\` to limit query results and reduce bandwidth
3. **Paginate Large Datasets:** Implement cursor-based pagination for large result sets
4. **Cache Queries:** Query results are automatically cached when dependencies don't change

### Database Reads
1. **Minimize Document Reads:** Each document read counts toward bandwidth costs
2. **Batch Operations:** Read multiple documents in a single query when possible
3. **Use Selective Fields:** Only read the fields you need (Convex returns full documents)
4. **Avoid Unnecessary Queries:** Consolidate multiple queries into one when possible

### Function Execution
1. **Reduce Computation:** Move heavy processing to actions (they're cheaper)
2. **Debounce/Throttle:** Avoid excessive function calls from UI interactions
3. **Batch Updates:** Group multiple mutations into fewer calls
4. **Use Internal Functions:** Internal functions don't count as separate executions

### Actions vs Queries/Mutations
1. **Use Actions for External APIs:** Actions can call external services
2. **Actions for Heavy Compute:** Actions are better for CPU-intensive tasks
3. **Mutations for Database Writes:** Keep mutations focused on database operations
4. **Queries for Reads:** Queries benefit from automatic caching

### General Tips
1. **Monitor Cache Hit Rate:** High cache hit rates reduce execution costs
2. **Avoid Write Conflicts:** Use optimistic updates and proper transaction design
3. **Minimize File Storage I/O:** File bandwidth is more expensive than database
4. **Review Frequently Called Functions:** Focus optimization on high-volume functions

## Question
What specific optimizations would you recommend for this function to reduce execution time, bandwidth usage, and overall costs?`;

      navigator.clipboard
        .writeText(debugMessage)
        .then(() => {
          toast.success("Debug info copied to clipboard!", {
            description:
              "Paste into your AI assistant to get optimization suggestions",
          });
        })
        .catch(() => {
          toast.error("Failed to copy to clipboard");
        });
    },
    [dashboardData, timeRange, isUserProjects, formatMs],
  );

  return (
    <div className="space-y-6">
      {/* Loading/Error States */}
      {isLoading && !dashboardData && (
        <LoadingState message="Loading cost metrics..." />
      )}
      {error && !dashboardData && (
        <EmptyState
          icon={DollarSign}
          title="Failed to load cost data"
          description={error}
        />
      )}

      {/* Cost Dashboard */}
      {dashboardData && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Executions"
              value={dashboardData.summary.totalExecutions.toLocaleString()}
              description={
                isUserProjects ? "API calls (all projects)" : "Function calls"
              }
              icon={Activity}
              variant="default"
            />
            <MetricCard
              title="Total Bandwidth"
              value={formatBytes(dashboardData.summary.totalBandwidthBytes)}
              description={isUserProjects ? "All projects" : "Database I/O"}
              icon={Database}
              variant="default"
            />
            <MetricCard
              title="Total Execution Time"
              value={formatMs(dashboardData.summary.totalExecutionTimeMs)}
              description={isUserProjects ? "All projects" : "Compute time"}
              icon={Clock}
              variant="default"
            />
            <MetricCard
              title="Estimated Cost"
              value={formatCost(dashboardData.summary.estimatedTotalCost)}
              description="Based on Convex pricing"
              icon={DollarSign}
              variant="warning"
            />
          </div>

          {/* Top Cost Contributors */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TopCostItemsAccordion
              title={
                isUserProjects
                  ? "Top Projects by Cost (Estimated)"
                  : "Top Cost Contributors (by Estimated Cost)"
              }
              items={dashboardData.topCostFunctions}
              onDebugClick={handleDebugClick}
              onDebugAllClick={handleDebugAllClick}
              emptyMessage={
                isUserProjects
                  ? "No project data available"
                  : "No cost data available"
              }
              defaultOpen={true}
              showPauseButtons={isUserProjects}
              showDeploymentLinks={isUserProjects}
              deploymentPauseStatus={
                isUserProjects ? deploymentPauseStatus : undefined
              }
              onPauseClick={isUserProjects ? onPauseResume : undefined}
            />

            {/* Cost Breakdown Accordion */}
            <CostBreakdownAccordion
              totalExecutions={dashboardData.summary.totalExecutions}
              estimatedTotalCost={dashboardData.summary.estimatedTotalCost}
              functionCallsCost={
                dashboardData.summary.costBreakdown.functionCallsCost
              }
              computeCost={dashboardData.summary.costBreakdown.computeCost}
              computeGBHours={
                dashboardData.summary.costBreakdown.computeGBHours
              }
              dbBandwidthCost={
                dashboardData.summary.costBreakdown.dbBandwidthCost
              }
              dbBandwidthGB={dashboardData.summary.costBreakdown.dbBandwidthGB}
              fileBandwidthCost={
                dashboardData.summary.costBreakdown.fileBandwidthCost
              }
              fileBandwidthGB={
                dashboardData.summary.costBreakdown.fileBandwidthGB
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
