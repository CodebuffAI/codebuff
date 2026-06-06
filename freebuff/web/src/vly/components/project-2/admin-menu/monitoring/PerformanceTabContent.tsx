"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  Zap,
  Database,
  TrendingUp,
  Clock,
  Bot,
  Pause,
  Play,
} from "lucide-react";
import { LoadingState, EmptyState } from "../shared";
import { MetricCard, TopItem } from "./shared";
import type { PerformanceDashboard } from "@/vly/lib/monitoring/monitoring-types";
import { TIME_RANGES } from "@/vly/lib/monitoring/monitoring-constants";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/vly/components/ui/card";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import { cn } from "@/vly/lib/utils";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

// Generate performance-specific debug info for clipboard
function generatePerformanceDebugInfo(
  item: TopItem,
  metricType:
    | "slow_query"
    | "slow_mutation"
    | "slow_action"
    | "write_conflict"
    | "high_doc_reads"
    | "high_bandwidth",
): string {
  const functionPath = item.label;
  const primaryValue = item.value;
  const executionCount = item.secondaryValue;

  let metricDescription = "";
  let specificHints = "";

  switch (metricType) {
    case "slow_query":
      metricDescription = `**Average Execution Time:** ${primaryValue.toFixed(0)}ms ⚠️\n**Execution Count:** ${executionCount || "N/A"}`;
      specificHints = `⚠️ **Slow Query Detected**: This query is averaging ${primaryValue.toFixed(0)}ms per execution.

**Common causes:**
- Using \`.filter()\` instead of \`.withIndex()\`
- Missing index on the queried field
- Reading too many documents
- Complex computations in the query

**Optimization checklist:**
1. Check if an index exists for this query pattern in schema.ts
2. Replace any \`.filter()\` calls with \`.withIndex()\`
3. Use \`.take(N)\` to limit results if you don't need all documents
4. Move complex logic to the client or use pagination`;
      break;

    case "slow_mutation":
      metricDescription = `**Average Execution Time:** ${primaryValue.toFixed(0)}ms ⚠️\n**Execution Count:** ${executionCount || "N/A"}`;
      specificHints = `⚠️ **Slow Mutation Detected**: This mutation is averaging ${primaryValue.toFixed(0)}ms per execution.

**Common causes:**
- Multiple database writes in sequence
- Reading many documents before writing
- Complex validation logic
- Missing indexes for reads within the mutation

**Optimization checklist:**
1. Minimize database reads - use indexes for lookups
2. Batch related writes when possible
3. Move heavy computation to actions if it doesn't need transactional guarantees
4. Consider using background actions for non-critical writes`;
      break;

    case "slow_action":
      metricDescription = `**Average Execution Time:** ${primaryValue.toFixed(0)}ms ⚠️\n**Execution Count:** ${executionCount || "N/A"}`;
      specificHints = `⚠️ **Slow Action Detected**: This action is averaging ${primaryValue.toFixed(0)}ms per execution.

**Common causes:**
- External API calls taking too long
- Inefficient database queries within runQuery/runMutation
- Large data processing
- Network latency

**Optimization checklist:**
1. Check if queries inside the action use proper indexes
2. Use Promise.all() for parallel external API calls
3. Consider caching frequently-accessed external data
4. Profile the action to identify the slowest parts`;
      break;

    case "write_conflict":
      metricDescription = `**Write Conflicts:** ${primaryValue} detected`;
      specificHints = `⚠️ **Write Conflicts Detected**: This function has ${primaryValue} optimistic concurrency control (OCC) conflicts.

**What are write conflicts?**
Write conflicts occur when multiple mutations try to modify the same document simultaneously. Convex automatically retries, but high conflict rates indicate a design issue.

**Common causes:**
- Multiple users/processes updating the same counter/aggregate
- High-frequency updates to shared documents
- Race conditions in increment/decrement operations

**Solutions:**
1. **Avoid hot documents**: Don't store aggregates that many clients update
2. **Use dedicated tables**: Split frequently-updated fields into separate documents
3. **Batch updates**: Use scheduled functions to aggregate changes
4. **Rethink design**: Consider if you really need a shared counter

Example - Bad:
\`\`\`typescript
// Many clients incrementing the same counter = conflicts
await ctx.db.patch(statsId, { viewCount: stats.viewCount + 1 })
\`\`\`

Example - Good:
\`\`\`typescript
// Each view gets its own document, aggregate in query
await ctx.db.insert("views", { postId, userId, timestamp: Date.now() })
\`\`\``;
      break;

    case "high_doc_reads":
      metricDescription = `**Documents Read:** ${primaryValue.toLocaleString()} docs ⚠️`;
      specificHints = `⚠️ **High Document Reads**: This function read ${primaryValue.toLocaleString()} documents.

**This is usually a sign of:**
- Missing index - query is doing a table scan
- Using \`.filter()\` instead of \`.withIndex()\`
- Reading entire collections without pagination

**Should you add an index?**
- If this runs frequently (every page load, user action) → YES
- If this is an admin dashboard → MAYBE
- If this is a one-time migration → NO

**Optimization steps:**
1. Identify the field you're querying/filtering by
2. Add an index in schema.ts if justified
3. Replace \`.filter()\` with \`.withIndex()\`
4. Add \`.take(N)\` for pagination

Example:
\`\`\`typescript
// Before (table scan)
const messages = await ctx.db
  .query("messages")
  .filter(q => q.eq(q.field("threadId"), args.threadId))
  .collect();

// After (indexed)
const messages = await ctx.db
  .query("messages")
  .withIndex("by_thread_id", q => q.eq("threadId", args.threadId))
  .take(100); // Add pagination
\`\`\``;
      break;

    case "high_bandwidth":
      metricDescription = `**Data Read:** ${(primaryValue / 1024).toFixed(2)}KB`;
      specificHints = `⚠️ **High Bandwidth Usage**: This function read ${(primaryValue / 1024).toFixed(2)}KB of data.

**Common causes:**
- Reading large documents with unnecessary fields
- Fetching entire collections
- Including large binary data or arrays
- No pagination

**Optimization strategies:**
1. **Select only needed fields**: Don't read the entire document if you only need specific fields
2. **Paginate results**: Use \`.take(N)\` to limit results
3. **Store large data separately**: Move images/files to file storage
4. **Use indexes efficiently**: Ensure you're not scanning unnecessary documents

Note: High bandwidth isn't always bad if the data is needed. Focus on reducing it if:
- The function runs very frequently
- Most of the data isn't used by the client
- It's causing performance issues`;
      break;
  }

  return `# Performance Debug Info - System-Wide Analysis

**⚠️ METRIC SCOPE:** This analysis shows **system-wide performance metrics** for the selected time range.
The function listed below has been identified as a top contributor to this metric **across ALL functions** in your deployment.

**Function:** ${functionPath}
**Metric Type:** ${metricType.replace(/_/g, " ").toUpperCase()}
**Context:** This function appears in the system-wide ranking for ${metricType.replace(/_/g, " ")}

${metricDescription}

## Convex Performance Guidelines

When debugging Convex performance, follow these best practices:

1. **Use indexes, not filters**: Replace \`.filter()\` with \`.withIndex()\` for production queries
2. **Indexes aren't free**: They have storage and write costs. Only add indexes that are defensible:
   - ✅ Add for: Frequently-run queries, user-facing features, queries that need to scale
   - ❌ Skip for: One-off admin queries, rarely-used features, queries on small tables (<100 docs)
3. **Limit document scans**: Queries reading 100+ documents should use indexes
4. **Optimize data fetching**: Only read fields you need, use \`.take(N)\` for pagination
5. **Profile before optimizing**: Use the monitoring dashboard to identify real bottlenecks

Learn more: https://stack.convex.dev/queries-that-scale

## Specific Analysis

${specificHints}

## System-Wide Impact

This function is ranked among the top contributors to ${metricType.replace(/_/g, " ")} **across the entire system**. Optimizing this function will improve overall system performance and may have a significant impact on resource usage.

## Next Steps

1. Review the function code: \`${functionPath}\`
2. Check schema.ts for existing indexes
3. Apply the suggested optimizations
4. Monitor the metrics after changes to verify improvement
5. Consider adding tests for the optimized queries
6. Re-check the system-wide metrics dashboard to confirm the optimization impact
`;
}

interface MetricRankingCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "success" | "warning" | "error";
  items: TopItem[];
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  variantBadgeStyles: Record<string, string>;
  variantProgressBgStyles: Record<string, string>;
  onDebugClick?: (item: TopItem) => void;
  onDebugAllClick?: () => void;
  showPauseButtons?: boolean;
  showDeploymentLinks?: boolean;
  deploymentPauseStatus?: Map<
    string,
    { paused: boolean; projectId: Id<"project"> | null }
  >;
  onPauseClick?: (
    deploymentName: string,
    projectId: Id<"project"> | null,
    isPaused: boolean,
  ) => void;
}

function MetricRankingCard({
  title,
  icon: Icon,
  variant,
  items,
  formatValue = (val) => val.toString(),
  emptyMessage = "No items to display",
  variantBadgeStyles,
  variantProgressBgStyles,
  onDebugClick,
  onDebugAllClick,
  showPauseButtons = false,
  showDeploymentLinks = false,
  deploymentPauseStatus,
  onPauseClick,
}: MetricRankingCardProps) {
  const maxValue =
    items.length > 0 ? Math.max(...items.map((i) => i.value)) : 1;

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(variantBadgeStyles[variant])}
            >
              {items.length}
            </Badge>
            {onDebugAllClick && items.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onDebugAllClick();
                }}
                title="Copy debug info for all items to clipboard"
              >
                <Bot className="h-3 w-3" />
                <span className="text-xs">Debug All</span>
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const percentage = (item.value / maxValue) * 100;
              return (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    {showDeploymentLinks ? (
                      <a
                        href={`https://dashboard.convex.dev/d/${item.label}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span className="truncate font-mono text-xs">
                        {item.label}
                      </span>
                    )}
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(variantBadgeStyles[variant])}
                      >
                        {formatValue(item.value)}
                      </Badge>
                      {item.secondaryValue !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {item.secondaryLabel && `${item.secondaryLabel}: `}
                          {item.secondaryValue}
                        </span>
                      )}
                      {showPauseButtons &&
                        deploymentPauseStatus &&
                        onPauseClick &&
                        (() => {
                          const status = deploymentPauseStatus.get(item.label);
                          if (status) {
                            const isPaused = status.paused;
                            const hasProjectId = status.projectId !== null;
                            return (
                              <>
                                <Badge
                                  variant={isPaused ? "destructive" : "default"}
                                  className={cn(
                                    "text-xs",
                                    isPaused
                                      ? ""
                                      : "bg-green-600 hover:bg-green-700",
                                  )}
                                >
                                  {isPaused ? "Paused" : "Active"}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasProjectId) {
                                      onPauseClick(
                                        item.label,
                                        status.projectId,
                                        isPaused,
                                      );
                                    }
                                  }}
                                  disabled={!hasProjectId}
                                  title={
                                    !hasProjectId
                                      ? "Project not found - cannot pause"
                                      : isPaused
                                        ? "Resume project"
                                        : "Pause project"
                                  }
                                >
                                  {isPaused ? (
                                    <Play className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Pause className="h-3 w-3 text-red-600" />
                                  )}
                                </Button>
                              </>
                            );
                          }
                          return null;
                        })()}
                      {onDebugClick && !showPauseButtons && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDebugClick(item);
                          }}
                          title="Copy debug info to clipboard"
                        >
                          <Bot className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "h-1.5 w-full overflow-hidden rounded-full",
                      variantProgressBgStyles[variant],
                    )}
                  >
                    <div
                      className={cn(
                        "h-full transition-all",
                        variant === "default" && "bg-blue-500",
                        variant === "success" && "bg-green-500",
                        variant === "warning" && "bg-yellow-500",
                        variant === "error" && "bg-red-500",
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PerformanceTabContentProps {
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

export function PerformanceTabContent({
  dataset,
  timeRange,
  refetchTrigger,
  deploymentPauseStatus,
  onFetchPauseStatuses,
  onPauseResume,
}: PerformanceTabContentProps) {
  const [dashboardData, setDashboardData] =
    useState<PerformanceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDashboard = useAction(api.monitoring.getPerformanceDashboard);

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

        result.slowestQueries?.forEach((item: { functionPath: string }) =>
          deploymentNames.add(item.functionPath),
        );
        result.slowestMutations?.forEach((item: { functionPath: string }) =>
          deploymentNames.add(item.functionPath),
        );
        result.slowestActions?.forEach((item: { functionPath: string }) =>
          deploymentNames.add(item.functionPath),
        );
        result.mostDocumentsRead?.forEach((item: { functionPath: string }) =>
          deploymentNames.add(item.functionPath),
        );
        result.mostDataRead?.forEach((item: { functionPath: string }) =>
          deploymentNames.add(item.functionPath),
        );

        await onFetchPauseStatuses(Array.from(deploymentNames));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch performance data";
      setError(errorMessage);
      console.error("Error fetching performance dashboard:", err);
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
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  // Debug handlers for each metric type
  const handleDebugClick = useCallback(
    async (
      item: TopItem,
      metricType:
        | "slow_query"
        | "slow_mutation"
        | "slow_action"
        | "write_conflict"
        | "high_doc_reads"
        | "high_bandwidth",
    ) => {
      try {
        const debugInfo = generatePerformanceDebugInfo(item, metricType);
        await navigator.clipboard.writeText(debugInfo);
        toast.success("Performance debug info copied to clipboard!");
      } catch (error) {
        toast.error("Failed to copy debug info");
        console.error("Copy error:", error);
      }
    },
    [],
  );

  // Debug All handlers
  const handleDebugAllSlowQueries = useCallback(async () => {
    if (!dashboardData?.slowestQueries.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - Slowest Queries

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.slowestQueries.length}

## Overview

These are the slowest queries across your entire system. Optimizing these will have the most impact on overall query performance.

## Top Slow Queries

${dashboardData.slowestQueries
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Average Execution Time:** ${formatMs(item.avgExecutionTimeMs)} ⚠️
- **Execution Count:** ${item.executionCount.toLocaleString()} calls
- **Total Time Spent:** ${formatMs(item.avgExecutionTimeMs * item.executionCount)}
`,
  )
  .join("\n")}

## Convex Query Optimization Guidelines

### Common Causes of Slow Queries
1. **Missing Indexes**: Using \`.filter()\` instead of \`.withIndex()\`
2. **Table Scans**: Reading too many documents without proper indexing
3. **Complex Computations**: Heavy processing within the query
4. **Inefficient Patterns**: Multiple sequential queries instead of batch operations

### Optimization Checklist
1. ✅ Check if an index exists for each query pattern in schema.ts
2. ✅ Replace any \`.filter()\` calls with \`.withIndex()\`
3. ✅ Use \`.take(N)\` to limit results if you don't need all documents
4. ✅ Move complex logic to the client or use pagination
5. ✅ Consider caching expensive computed values

### Index Best Practices
- **Add indexes for**: Frequently-run queries, user-facing features, queries that need to scale
- **Skip indexes for**: One-off admin queries, rarely-used features, queries on small tables (<100 docs)
- **Remember**: Indexes have storage and write costs, only add when defensible

### Example Optimization

\`\`\`typescript
// Before (slow - table scan)
const messages = await ctx.db
  .query("messages")
  .filter(q => q.eq(q.field("threadId"), args.threadId))
  .collect();

// After (fast - indexed)
// First, add to schema.ts:
// messages: defineTable({...})
//   .index("by_thread_id", ["threadId"])

const messages = await ctx.db
  .query("messages")
  .withIndex("by_thread_id", q => q.eq("threadId", args.threadId))
  .take(100); // Add pagination
\`\`\`

Learn more: https://stack.convex.dev/queries-that-scale

## Next Steps

1. Review each function listed above
2. Check schema.ts for existing indexes
3. Apply the suggested optimizations
4. Monitor the metrics after changes to verify improvement
5. Focus on high-execution-count queries for maximum impact`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success("Debug info for all slow queries copied to clipboard!", {
        description:
          "Paste into your AI assistant to get optimization suggestions",
      });
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange, formatMs]);

  const handleDebugAllSlowMutations = useCallback(async () => {
    if (!dashboardData?.slowestMutations.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - Slowest Mutations

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.slowestMutations.length}

## Overview

These are the slowest mutations across your entire system. Optimizing these will improve write performance and user experience.

## Top Slow Mutations

${dashboardData.slowestMutations
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Average Execution Time:** ${formatMs(item.avgExecutionTimeMs)} ⚠️
- **Execution Count:** ${item.executionCount.toLocaleString()} calls
- **Total Time Spent:** ${formatMs(item.avgExecutionTimeMs * item.executionCount)}
`,
  )
  .join("\n")}

## Convex Mutation Optimization Guidelines

### Common Causes of Slow Mutations
1. **Multiple Sequential Writes**: Writing documents one at a time instead of batching
2. **Inefficient Reads**: Reading many documents before writing (use indexes!)
3. **Complex Validation**: Heavy computation before writing
4. **Missing Indexes**: Slow lookups within the mutation

### Optimization Checklist
1. ✅ Minimize database reads - use indexes for lookups
2. ✅ Batch related writes when possible
3. ✅ Move heavy computation to actions if it doesn't need transactional guarantees
4. ✅ Consider using background actions for non-critical writes
5. ✅ Avoid reading entire collections - use indexed queries

### When to Use Actions Instead
Consider moving logic to actions if:
- You're calling external APIs
- Heavy computation that doesn't need ACID guarantees
- Background processing that can be async
- Operations that don't need to be in the same transaction

### Example Optimization

\`\`\`typescript
// Before (slow mutation)
export const updateUserStats = mutation({
  handler: async (ctx, args) => {
    // Slow: table scan to find user
    const user = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("email"), args.email))
      .first();

    // Multiple sequential writes
    await ctx.db.patch(user._id, { stat1: value1 });
    await ctx.db.patch(user._id, { stat2: value2 });
  },
});

// After (fast mutation)
// Add index to schema.ts:
// users: defineTable({...})
//   .index("by_email", ["email"])

export const updateUserStats = mutation({
  handler: async (ctx, args) => {
    // Fast: indexed lookup
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();

    // Single write with all changes
    await ctx.db.patch(user._id, {
      stat1: value1,
      stat2: value2
    });
  },
});
\`\`\`

Learn more: https://stack.convex.dev/queries-that-scale

## Next Steps

1. Review each mutation listed above
2. Identify read operations and ensure they use indexes
3. Look for opportunities to batch writes
4. Consider moving heavy computation to actions
5. Monitor metrics after optimization`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success("Debug info for all slow mutations copied to clipboard!", {
        description:
          "Paste into your AI assistant to get optimization suggestions",
      });
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange, formatMs]);

  const handleDebugAllSlowActions = useCallback(async () => {
    if (!dashboardData?.slowestActions.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - Slowest Actions

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.slowestActions.length}

## Overview

These are the slowest actions across your entire system. Actions are typically used for external API calls and heavy computation.

## Top Slow Actions

${dashboardData.slowestActions
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Average Execution Time:** ${formatMs(item.avgExecutionTimeMs)} ⚠️
- **Execution Count:** ${item.executionCount.toLocaleString()} calls
- **Total Time Spent:** ${formatMs(item.avgExecutionTimeMs * item.executionCount)}
`,
  )
  .join("\n")}

## Convex Action Optimization Guidelines

### Common Causes of Slow Actions
1. **External API Latency**: Third-party services taking too long to respond
2. **Sequential API Calls**: Making API calls one at a time instead of parallel
3. **Inefficient Queries**: Using slow queries within runQuery/runMutation
4. **Large Data Processing**: Processing too much data at once
5. **Network Timeouts**: Waiting for slow external services

### Optimization Checklist
1. ✅ Use Promise.all() for parallel external API calls
2. ✅ Ensure queries inside actions use proper indexes
3. ✅ Consider caching frequently-accessed external data
4. ✅ Profile the action to identify the slowest parts
5. ✅ Add timeouts to prevent hanging on slow external services
6. ✅ Break large processing tasks into smaller chunks

### Parallel vs Sequential Operations

\`\`\`typescript
// Before (slow - sequential)
export const fetchUserData = action({
  handler: async (ctx) => {
    const profile = await fetch("https://api.example.com/profile");
    const settings = await fetch("https://api.example.com/settings");
    const posts = await fetch("https://api.example.com/posts");
    // Takes: 300ms + 200ms + 400ms = 900ms total
  },
});

// After (fast - parallel)
export const fetchUserData = action({
  handler: async (ctx) => {
    const [profile, settings, posts] = await Promise.all([
      fetch("https://api.example.com/profile"),
      fetch("https://api.example.com/settings"),
      fetch("https://api.example.com/posts"),
    ]);
    // Takes: max(300ms, 200ms, 400ms) = 400ms total
  },
});
\`\`\`

### Query Optimization in Actions

\`\`\`typescript
// Before (slow query in action)
export const processUsers = action({
  handler: async (ctx) => {
    const users = await ctx.runQuery(internal.users.list, {});
    // Slow if list() uses filter() instead of withIndex()
  },
});

// After (fast indexed query in action)
// Ensure the underlying query uses indexes:
export const list = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_status", q => q.eq("status", "active"))
      .take(100);
  },
});
\`\`\`

## Next Steps

1. Profile each action to identify bottlenecks
2. Look for sequential operations that can be parallelized
3. Check queries used within actions for proper indexing
4. Consider adding timeouts and retry logic for external APIs
5. Implement caching for frequently-accessed external data`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success("Debug info for all slow actions copied to clipboard!", {
        description:
          "Paste into your AI assistant to get optimization suggestions",
      });
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange, formatMs]);

  const handleDebugAllWriteConflicts = useCallback(async () => {
    if (!dashboardData?.writeConflicts.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - Write Conflicts

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.writeConflicts.length}

## Overview

Write conflicts occur when multiple mutations try to modify the same document simultaneously. Convex uses Optimistic Concurrency Control (OCC) and automatically retries, but high conflict rates indicate a design issue.

## Functions with Write Conflicts

${dashboardData.writeConflicts
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Conflict Count:** ${item.conflictCount} conflicts detected ⚠️
`,
  )
  .join("\n")}

## Understanding Write Conflicts

### What Causes Write Conflicts?
1. **Hot Documents**: Multiple users/processes updating the same document
2. **Shared Counters**: Many clients incrementing/decrementing the same counter
3. **High-Frequency Updates**: Rapid updates to the same record
4. **Poor Data Modeling**: Aggregates that should be computed, not stored

### Why This Matters
- Each conflict forces a retry, wasting compute time
- High conflict rates slow down all mutations
- Indicates potential data modeling issues
- Can lead to race conditions and data inconsistencies

## Solutions and Best Practices

### 1. Avoid Hot Documents
\`\`\`typescript
// ❌ Bad: Many clients updating the same counter
export const incrementViews = mutation({
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    await ctx.db.patch(postId, {
      viewCount: post.viewCount + 1
    });
    // This creates conflicts when multiple users view simultaneously
  },
});

// ✅ Good: Each view gets its own document
export const recordView = mutation({
  handler: async (ctx, { postId, userId }) => {
    await ctx.db.insert("views", {
      postId,
      userId,
      timestamp: Date.now()
    });
    // Compute count in a query - no conflicts!
  },
});

export const getViewCount = query({
  handler: async (ctx, { postId }) => {
    const views = await ctx.db
      .query("views")
      .withIndex("by_post_id", q => q.eq("postId", postId))
      .collect();
    return views.length;
  },
});
\`\`\`

### 2. Use Dedicated Tables for Aggregates
Instead of updating a counter field, create separate documents:
- Likes: Separate "likes" table instead of likeCount field
- Views: Separate "views" table instead of viewCount field
- Votes: Separate "votes" table instead of voteCount field

### 3. Batch Updates with Scheduled Functions
\`\`\`typescript
// Instead of updating totals on every change:
// Use a scheduled function to aggregate periodically
export const updateDailyStats = internalMutation({
  handler: async (ctx) => {
    // Aggregate views from the last hour
    const views = await ctx.db
      .query("views")
      .withIndex("by_timestamp", q =>
        q.gte("timestamp", Date.now() - 3600000)
      )
      .collect();

    // Update stats once, instead of on every view
    await ctx.db.insert("daily_stats", {
      date: new Date().toISOString().split("T")[0],
      viewCount: views.length,
    });
  },
});
\`\`\`

### 4. Rethink Shared State
Ask yourself:
- Do I really need real-time updates for this counter?
- Can I compute this value in a query instead of storing it?
- Is this aggregate critical, or can it be eventually consistent?

## Next Steps

1. Review each function with write conflicts
2. Identify the "hot documents" being updated
3. Redesign data model to avoid shared state
4. Move counters/aggregates to computed queries
5. Consider scheduled functions for periodic aggregation
6. Monitor conflict rates after changes

Learn more: https://docs.convex.dev/database/advanced/occ`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success("Debug info for all write conflicts copied to clipboard!", {
        description:
          "Paste into your AI assistant to get optimization suggestions",
      });
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange]);

  const handleDebugAllHighDocReads = useCallback(async () => {
    if (!dashboardData?.mostDocumentsRead.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - High Document Reads

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.mostDocumentsRead.length}

## Overview

These functions are reading the most documents. High document reads usually indicate missing indexes or inefficient query patterns.

## Top Document Readers

${dashboardData.mostDocumentsRead
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Total Documents Read:** ${item.totalDocumentsRead.toLocaleString()} docs ⚠️
`,
  )
  .join("\n")}

## Understanding Document Reads

### What This Means
- Each document read counts toward your query cost
- High reads indicate potential table scans
- Missing indexes force Convex to scan more documents
- Reading 100+ documents per query is usually inefficient

### When Are High Reads Acceptable?
- ✅ One-off admin queries or migrations
- ✅ Background jobs processing large datasets
- ✅ Analytics queries on small tables (<100 docs)
- ❌ User-facing queries on every page load
- ❌ Frequently-called functions
- ❌ Real-time queries that need to scale

## Optimization Strategies

### 1. Add Indexes for Common Queries
\`\`\`typescript
// ❌ Bad: Table scan (reads all documents)
const userMessages = await ctx.db
  .query("messages")
  .filter(q => q.eq(q.field("userId"), args.userId))
  .collect();
// Reads ALL messages to find user's messages

// ✅ Good: Indexed query (reads only relevant documents)
// First, add to schema.ts:
// messages: defineTable({...})
//   .index("by_user_id", ["userId"])

const userMessages = await ctx.db
  .query("messages")
  .withIndex("by_user_id", q => q.eq("userId", args.userId))
  .take(100);
// Reads only user's messages (up to 100)
\`\`\`

### 2. Use Pagination
\`\`\`typescript
// ❌ Bad: Load all documents at once
const allPosts = await ctx.db
  .query("posts")
  .withIndex("by_created_at")
  .collect();
// Reads thousands of documents

// ✅ Good: Paginate results
const recentPosts = await ctx.db
  .query("posts")
  .withIndex("by_created_at")
  .order("desc")
  .take(20);
// Reads only 20 documents
\`\`\`

### 3. Avoid Unnecessary Collection
\`\`\`typescript
// ❌ Bad: Collect everything then filter in JS
const posts = await ctx.db
  .query("posts")
  .collect();
const publishedPosts = posts.filter(p => p.published);

// ✅ Good: Filter with index
// Add to schema.ts:
// posts: defineTable({...})
//   .index("by_published", ["published"])

const publishedPosts = await ctx.db
  .query("posts")
  .withIndex("by_published", q => q.eq("published", true))
  .collect();
\`\`\`

### 4. Consider Composite Indexes
\`\`\`typescript
// For queries that filter by multiple fields:
// Add to schema.ts:
// messages: defineTable({...})
//   .index("by_user_and_read", ["userId", "isRead"])

// Now you can efficiently query:
const unreadMessages = await ctx.db
  .query("messages")
  .withIndex("by_user_and_read", q =>
    q.eq("userId", args.userId).eq("isRead", false)
  )
  .collect();
\`\`\`

## Should You Add an Index?

### ✅ Add an Index When:
1. The query runs frequently (every page load, user action)
2. It's a user-facing feature that needs to be fast
3. The table will grow over time
4. Document reads are consistently high (>100 docs)

### ❌ Skip the Index When:
1. It's a one-off admin query or migration
2. The feature is rarely used
3. The table is small and won't grow (<100 docs)
4. The query already uses an appropriate index

### Remember:
- Indexes have storage cost and write overhead
- Only add indexes that are defensible
- Every write updates all indexes on that table

## Next Steps

1. Review each function listed above
2. Identify which fields are being queried/filtered
3. Add indexes to schema.ts for justified cases
4. Replace \`.filter()\` with \`.withIndex()\`
5. Add \`.take(N)\` for pagination where appropriate
6. Monitor document reads after optimization

Learn more: https://stack.convex.dev/queries-that-scale`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success("Debug info for all high doc reads copied to clipboard!", {
        description:
          "Paste into your AI assistant to get optimization suggestions",
      });
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange]);

  const handleDebugAllHighBandwidth = useCallback(async () => {
    if (!dashboardData?.mostDataRead.length) return;

    const timeRangeLabel =
      TIME_RANGES.find((tr) => tr.value === timeRange)?.label ||
      "Last 24 hours";

    const debugMessage = `# System-Wide Performance Analysis - High Bandwidth Usage

**Time Period:** ${timeRangeLabel}
**Total Functions:** ${dashboardData.mostDataRead.length}

## Overview

These functions are reading the most data (bytes). High bandwidth can indicate large documents, inefficient queries, or missing pagination.

## Top Bandwidth Consumers

${dashboardData.mostDataRead
  .map(
    (item, idx) => `### ${idx + 1}. ${item.functionPath}
- **Total Data Read:** ${formatBytes(item.totalDataReadBytes)} ⚠️
`,
  )
  .join("\n")}

## Understanding Bandwidth Usage

### What Affects Bandwidth
1. **Document Size**: Large documents with many fields
2. **Document Count**: Reading many documents
3. **Array Fields**: Large arrays stored in documents
4. **Binary Data**: Images, files stored in documents
5. **Lack of Pagination**: Loading entire collections

### Bandwidth Costs
Based on Convex Professional pricing:
- **Database Bandwidth**: $0.20 per GB (reads + writes)
- **File Bandwidth**: $0.30 per GB (reads + writes)

## Optimization Strategies

### 1. Use Pagination
\`\`\`typescript
// ❌ Bad: Load all posts (could be GB of data)
const allPosts = await ctx.db
  .query("posts")
  .withIndex("by_created_at")
  .collect();

// ✅ Good: Paginate (only load what you need)
const recentPosts = await ctx.db
  .query("posts")
  .withIndex("by_created_at")
  .order("desc")
  .take(20);
\`\`\`

### 2. Store Large Data Separately
\`\`\`typescript
// ❌ Bad: Store images/files in documents
await ctx.db.insert("posts", {
  title: "My Post",
  content: "...",
  imageBase64: "data:image/png;base64,iVBORw0KG..." // Large!
});

// ✅ Good: Use Convex file storage
const imageId = await ctx.storage.store(imageBlob);
await ctx.db.insert("posts", {
  title: "My Post",
  content: "...",
  imageId: imageId, // Small reference
});
\`\`\`

### 3. Minimize Document Size
\`\`\`typescript
// Consider splitting large documents into related tables:

// ❌ Bad: Everything in one document
{
  userId: "123",
  profile: { name: "...", bio: "...", ... },
  settings: { theme: "...", notifications: { ... } },
  posts: [{ title: "...", content: "..." }, ...], // Large array!
  followers: ["user1", "user2", ...], // Large array!
}

// ✅ Good: Normalized data model
// users table: { userId, name, bio }
// user_settings table: { userId, theme, notifications }
// posts table: { postId, userId, title, content }
// followers table: { followerId, followeeId }
\`\`\`

### 4. Avoid Redundant Data
\`\`\`typescript
// ❌ Bad: Denormalizing everything
await ctx.db.insert("posts", {
  title: "My Post",
  authorId: "user123",
  authorName: "John Doe", // Redundant
  authorEmail: "john@example.com", // Redundant
  authorAvatar: "https://...", // Redundant
});

// ✅ Good: Reference related data
await ctx.db.insert("posts", {
  title: "My Post",
  authorId: "user123", // Just the ID
});
// Fetch author data separately when needed
\`\`\`

### 5. Consider Projection (Future Convex Feature)
Currently, Convex returns entire documents. In the future:
\`\`\`typescript
// Ideal (not yet available):
const users = await ctx.db
  .query("users")
  .select({ name: true, email: true }) // Only these fields
  .collect();
\`\`\`

For now, you can filter on the client side, but bandwidth is still used.

## When Is High Bandwidth Acceptable?

### ✅ Acceptable Cases:
- Admin dashboards that need full data
- Background jobs processing large datasets
- One-time data exports
- Analytics queries (infrequent)

### ❌ Needs Optimization:
- User-facing queries on every page load
- Real-time queries fetching large documents
- Queries loading full collections without pagination
- Functions called frequently with high bandwidth

## Next Steps

1. Review each function listed above
2. Identify why bandwidth is high (large docs? many docs? no pagination?)
3. Implement pagination with \`.take(N)\`
4. Move large binary data to file storage
5. Consider normalizing large nested objects
6. Monitor bandwidth usage after optimization

Learn more:
- https://docs.convex.dev/file-storage
- https://stack.convex.dev/queries-that-scale`;

    try {
      await navigator.clipboard.writeText(debugMessage);
      toast.success(
        "Debug info for all high bandwidth usage copied to clipboard!",
        {
          description:
            "Paste into your AI assistant to get optimization suggestions",
        },
      );
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  }, [dashboardData, timeRange, formatBytes]);

  // Variant styling
  const variantBadgeStyles = {
    default:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    success:
      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    warning:
      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    error: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  };

  const variantProgressBgStyles = {
    default: "bg-blue-500/20",
    success: "bg-green-500/20",
    warning: "bg-yellow-500/20",
    error: "bg-red-500/20",
  };

  // Convert dashboard data to TopItem format
  const writeConflictsItems: TopItem[] = (
    dashboardData?.writeConflicts || []
  ).map((item, idx) => ({
    id: `conflict-${idx}`,
    label: item.functionPath,
    value: item.conflictCount,
  }));

  const slowestQueriesItems: TopItem[] = (
    dashboardData?.slowestQueries || []
  ).map((item, idx) => ({
    id: `query-${idx}`,
    label: item.functionPath,
    value: item.avgExecutionTimeMs,
    secondaryValue: item.executionCount,
    secondaryLabel: "calls",
  }));

  const slowestMutationsItems: TopItem[] = (
    dashboardData?.slowestMutations || []
  ).map((item, idx) => ({
    id: `mutation-${idx}`,
    label: item.functionPath,
    value: item.avgExecutionTimeMs,
    secondaryValue: item.executionCount,
    secondaryLabel: "calls",
  }));

  const slowestActionsItems: TopItem[] = (
    dashboardData?.slowestActions || []
  ).map((item, idx) => ({
    id: `action-${idx}`,
    label: item.functionPath,
    value: item.avgExecutionTimeMs,
    secondaryValue: item.executionCount,
    secondaryLabel: "calls",
  }));

  const mostDocumentsReadItems: TopItem[] = (
    dashboardData?.mostDocumentsRead || []
  ).map((item, idx) => ({
    id: `docs-${idx}`,
    label: item.functionPath,
    value: item.totalDocumentsRead,
  }));

  const mostDataReadItems: TopItem[] = (dashboardData?.mostDataRead || []).map(
    (item, idx) => ({
      id: `data-${idx}`,
      label: item.functionPath,
      value: item.totalDataReadBytes,
    }),
  );

  const isUserProjects = dataset === "convex-user-usage";

  return (
    <div className="space-y-6">
      {/* Loading/Error States */}
      {isLoading && !dashboardData && (
        <LoadingState message="Loading performance metrics..." />
      )}
      {error && !dashboardData && (
        <EmptyState
          icon={Activity}
          title="Failed to load performance data"
          description={error}
        />
      )}

      {/* Performance Dashboard */}
      {dashboardData && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {!isUserProjects && (
              <>
                <MetricCard
                  title="Query Cache Hit Rate"
                  value={formatPercentage(
                    dashboardData.queryCacheHitRate.hitRate,
                  )}
                  description={`${dashboardData.queryCacheHitRate.totalQueries} total queries`}
                  icon={Zap}
                  variant={
                    dashboardData.queryCacheHitRate.hitRate > 80
                      ? "success"
                      : dashboardData.queryCacheHitRate.hitRate > 50
                        ? "warning"
                        : "error"
                  }
                />
                <MetricCard
                  title="Write Conflicts"
                  value={dashboardData.writeConflicts.length}
                  description="Functions with conflicts"
                  icon={Activity}
                  variant={
                    dashboardData.writeConflicts.length > 0
                      ? "warning"
                      : "success"
                  }
                />
              </>
            )}
            <MetricCard
              title={
                isUserProjects
                  ? "Top Project by Exec Time"
                  : "Slowest Query Avg"
              }
              value={formatMs(
                dashboardData.slowestQueries[0]?.avgExecutionTimeMs || 0,
              )}
              description={
                dashboardData.slowestQueries[0]?.functionPath || "N/A"
              }
              icon={Clock}
              variant={
                dashboardData.slowestQueries[0]?.avgExecutionTimeMs > 1000
                  ? "error"
                  : "default"
              }
            />
            <MetricCard
              title={
                isUserProjects
                  ? "Top Project by Bandwidth"
                  : "Top Resource User"
              }
              value={formatBytes(
                dashboardData.mostDataRead[0]?.totalDataReadBytes || 0,
              )}
              description={dashboardData.mostDataRead[0]?.functionPath || "N/A"}
              icon={Database}
              variant="default"
            />
          </div>

          {/* Monitoring Rankings */}
          <Accordion type="single" collapsible defaultValue="item-1">
            <AccordionItem value="item-1" className="rounded-lg border px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  <span className="text-lg font-semibold">
                    Monitoring Rankings
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Functions with Write Conflicts - vly-convex only */}
                  {!isUserProjects && (
                    <MetricRankingCard
                      title="Functions with Write Conflicts"
                      icon={Activity}
                      variant="warning"
                      items={writeConflictsItems}
                      formatValue={(val) => `${val} conflicts`}
                      emptyMessage="No write conflicts detected"
                      variantBadgeStyles={variantBadgeStyles}
                      variantProgressBgStyles={variantProgressBgStyles}
                      onDebugClick={(item) =>
                        handleDebugClick(item, "write_conflict")
                      }
                      onDebugAllClick={handleDebugAllWriteConflicts}
                    />
                  )}

                  {/* Slowest Queries / Top Projects by Exec Time */}
                  <MetricRankingCard
                    title={
                      isUserProjects
                        ? "Top Projects by Execution Time"
                        : "Slowest Queries"
                    }
                    icon={Clock}
                    variant="error"
                    items={slowestQueriesItems}
                    formatValue={formatMs}
                    emptyMessage={
                      isUserProjects
                        ? "No project data available"
                        : "No query data available"
                    }
                    variantBadgeStyles={variantBadgeStyles}
                    variantProgressBgStyles={variantProgressBgStyles}
                    onDebugClick={
                      !isUserProjects
                        ? (item) => handleDebugClick(item, "slow_query")
                        : undefined
                    }
                    onDebugAllClick={
                      !isUserProjects ? handleDebugAllSlowQueries : undefined
                    }
                    showPauseButtons={isUserProjects}
                    showDeploymentLinks={isUserProjects}
                    deploymentPauseStatus={
                      isUserProjects ? deploymentPauseStatus : undefined
                    }
                    onPauseClick={isUserProjects ? onPauseResume : undefined}
                  />

                  {/* Slowest Mutations - vly-convex only */}
                  {!isUserProjects && (
                    <MetricRankingCard
                      title="Slowest Mutations"
                      icon={Clock}
                      variant="warning"
                      items={slowestMutationsItems}
                      formatValue={formatMs}
                      emptyMessage="No mutation data available"
                      variantBadgeStyles={variantBadgeStyles}
                      variantProgressBgStyles={variantProgressBgStyles}
                      onDebugClick={(item) =>
                        handleDebugClick(item, "slow_mutation")
                      }
                      onDebugAllClick={handleDebugAllSlowMutations}
                    />
                  )}

                  {/* Slowest Actions - vly-convex only */}
                  {!isUserProjects && (
                    <MetricRankingCard
                      title="Slowest Actions"
                      icon={Clock}
                      variant="warning"
                      items={slowestActionsItems}
                      formatValue={formatMs}
                      emptyMessage="No action data available"
                      variantBadgeStyles={variantBadgeStyles}
                      variantProgressBgStyles={variantProgressBgStyles}
                      onDebugClick={(item) =>
                        handleDebugClick(item, "slow_action")
                      }
                      onDebugAllClick={handleDebugAllSlowActions}
                    />
                  )}

                  {/* Most Documents Read / Top Projects by Documents Read */}
                  <MetricRankingCard
                    title={
                      isUserProjects
                        ? "Top Projects by Documents Read"
                        : "Most Documents Read"
                    }
                    icon={Database}
                    variant="default"
                    items={mostDocumentsReadItems}
                    formatValue={(val) => `${val.toLocaleString()} docs`}
                    emptyMessage={
                      isUserProjects
                        ? "No project data available"
                        : "No document read data available"
                    }
                    variantBadgeStyles={variantBadgeStyles}
                    variantProgressBgStyles={variantProgressBgStyles}
                    onDebugClick={
                      !isUserProjects
                        ? (item) => handleDebugClick(item, "high_doc_reads")
                        : undefined
                    }
                    onDebugAllClick={
                      !isUserProjects ? handleDebugAllHighDocReads : undefined
                    }
                    showPauseButtons={isUserProjects}
                    showDeploymentLinks={isUserProjects}
                    deploymentPauseStatus={
                      isUserProjects ? deploymentPauseStatus : undefined
                    }
                    onPauseClick={isUserProjects ? onPauseResume : undefined}
                  />

                  {/* Most Data Read / Top Projects by Bandwidth */}
                  <MetricRankingCard
                    title={
                      isUserProjects
                        ? "Top Projects by Bandwidth"
                        : "Most Data Read (Bandwidth)"
                    }
                    icon={TrendingUp}
                    variant="default"
                    items={mostDataReadItems}
                    formatValue={formatBytes}
                    emptyMessage={
                      isUserProjects
                        ? "No project data available"
                        : "No bandwidth data available"
                    }
                    variantBadgeStyles={variantBadgeStyles}
                    variantProgressBgStyles={variantProgressBgStyles}
                    onDebugClick={
                      !isUserProjects
                        ? (item) => handleDebugClick(item, "high_bandwidth")
                        : undefined
                    }
                    onDebugAllClick={
                      !isUserProjects ? handleDebugAllHighBandwidth : undefined
                    }
                    showPauseButtons={isUserProjects}
                    showDeploymentLinks={isUserProjects}
                    deploymentPauseStatus={
                      isUserProjects ? deploymentPauseStatus : undefined
                    }
                    onPauseClick={isUserProjects ? onPauseResume : undefined}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}
