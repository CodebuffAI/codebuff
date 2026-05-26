"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Badge } from "@/vly/components/ui/badge";
import { Checkbox } from "@/vly/components/ui/checkbox";
import { Label } from "@/vly/components/ui/label";
import {
  Activity,
  TrendingUp,
  DollarSign,
  XCircle,
  FileText,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  AlertCircle,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { SectionHeader, LoadingState, EmptyState } from "../shared";
import { FailuresTabContent } from "./FailuresTabContent";
import { PerformanceTabContent } from "./PerformanceTabContent";
import { CostTabContent } from "./CostTabContent";
import { TIME_RANGES } from "@/vly/lib/monitoring/monitoring-constants";
import { usePauseManagement } from "../hooks";
import { Id } from "@/convex/_generated/dataModel";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  functionName: string;
  deploymentName: string;
  message: string;
  metadata: Record<string, any>;
  rawData: any;
}

interface QueryResult {
  logs: LogEntry[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  query: {
    dataset: string;
    startTime: string;
    endTime: string;
    logLevels?: string[];
    searchText?: string;
  };
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
  debug: "bg-zinc-100 text-zinc-800 border-zinc-200",
};

const DATASETS = [
  { label: "vly.ai", value: "vly-convex" },
  { label: "User Projects", value: "convex-user-usage" },
];

export function MonitoringTabContent() {
  const [activeDataset, setActiveDataset] = useState("vly-convex");
  const [activeTab, setActiveTab] = useState("failures");

  // Switch to performance tab when switching to convex-user-usage (no failures tab)
  useEffect(() => {
    if (activeDataset === "convex-user-usage" && activeTab === "failures") {
      setActiveTab("performance");
    }
  }, [activeDataset, activeTab]);

  // Query state (shared across all tabs)
  const [dataset, setDataset] = useState("vly-convex");
  const [timeRange, setTimeRange] = useState("5m");
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(
    new Set(["info", "warn", "error", "debug"]),
  );
  const [searchText, setSearchText] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);

  // Quick filters
  const [errorsOnly, setErrorsOnly] = useState(false);

  // UI state
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [shouldAutoFetch, setShouldAutoFetch] = useState(false);

  // Refetch trigger for child tabs
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Pause state for user projects (shared across Performance and Cost tabs)
  const [deploymentPauseStatus, setDeploymentPauseStatus] = useState<
    Map<string, { paused: boolean; projectId: Id<"project"> | null }>
  >(new Map());

  // Refs
  const logsRef = React.useRef<HTMLDivElement>(null);

  // Convex actions
  const queryLogs = useAction(api.monitoring.queryConvexLogs);
  const getBatchDeploymentPauseStatuses = useAction(
    api.admin.getBatchDeploymentPauseStatuses,
  );
  const { handlePauseProject } = usePauseManagement();

  // Fetch deployment pause statuses for user projects
  const fetchDeploymentPauseStatuses = useCallback(
    async (deploymentNames: string[]) => {
      if (deploymentNames.length === 0) return;

      try {
        const results = await getBatchDeploymentPauseStatuses({
          deploymentNames,
        });

        // Convert results array to Map for efficient lookups
        const statusMap = new Map<
          string,
          { paused: boolean; projectId: Id<"project"> | null }
        >();
        results.forEach((result) => {
          statusMap.set(result.deploymentName, {
            paused: result.paused,
            projectId: result.projectId as Id<"project"> | null,
          });
        });

        setDeploymentPauseStatus(statusMap);
      } catch (error) {
        console.error(
          "Failed to fetch batch deployment pause statuses:",
          error,
        );
        // Don't show error to user - pause buttons will just not appear
      }
    },
    [getBatchDeploymentPauseStatuses],
  );

  // Handle pause/resume for a deployment
  const handlePauseResume = useCallback(
    async (
      deploymentName: string,
      projectId: Id<"project"> | null,
      isPaused: boolean,
    ) => {
      try {
        if (!projectId) {
          toast.error("Cannot pause deployment: Project not found");
          return;
        }

        // Get current pause status to pass to handler
        const pauseStatus = deploymentPauseStatus.get(deploymentName);
        if (!pauseStatus) return;

        // Use existing pause management hook
        await handlePauseProject(
          projectId,
          { active: pauseStatus.paused },
          "manual_admin",
        );

        // Refetch pause statuses after successful pause/resume
        await fetchDeploymentPauseStatuses([deploymentName]);
      } catch (error) {
        console.error("Failed to pause/resume deployment:", error);
        toast.error(
          `Failed to ${isPaused ? "resume" : "pause"} deployment: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [deploymentPauseStatus, handlePauseProject, fetchDeploymentPauseStatuses],
  );

  // Calculate time range
  const getTimeRange = useCallback(() => {
    const now = new Date();
    const timeRangeConfig = TIME_RANGES.find((tr) => tr.value === timeRange);
    if (!timeRangeConfig) {
      return {
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endTime: now.toISOString(),
      };
    }
    return {
      startTime: new Date(now.getTime() - timeRangeConfig.ms).toISOString(),
      endTime: now.toISOString(),
    };
  }, [timeRange]);

  // Fetch logs
  const fetchLogs = useCallback(
    async (resetOffset: boolean = true) => {
      setIsLoading(true);
      setError(null);

      try {
        const { startTime, endTime } = getTimeRange();
        const currentOffset = resetOffset ? 0 : offset;

        const result: QueryResult = await queryLogs({
          dataset,
          startTime,
          endTime,
          logLevels: Array.from(selectedLevels),
          searchText: searchText.trim() || undefined,
          limit,
          offset: currentOffset,
        });

        setLogs(result.logs);
        setTotalCount(result.totalCount);
        setHasMore(result.hasMore);
        if (resetOffset) {
          setOffset(0);
        }

        if (result.logs.length === 0) {
          toast.info("No logs found matching your filters");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch logs";
        setError(errorMessage);
        toast.error(errorMessage);
        console.error("Error fetching logs:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      getTimeRange,
      dataset,
      selectedLevels,
      searchText,
      limit,
      offset,
      queryLogs,
    ],
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-fetch when filters are updated programmatically
  useEffect(() => {
    if (shouldAutoFetch) {
      const fetchAndScroll = async () => {
        await fetchLogs();

        // Scroll logs section into view AFTER fetching completes
        if (logsRef.current) {
          logsRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      };

      fetchAndScroll();
      setShouldAutoFetch(false);
    }
  }, [shouldAutoFetch, fetchLogs]);

  // Toggle log level
  const toggleLogLevel = (level: LogLevel) => {
    setSelectedLevels((prev) => {
      const newLevels = new Set(prev);
      if (newLevels.has(level)) {
        newLevels.delete(level);
      } else {
        newLevels.add(level);
      }
      return newLevels;
    });
  };

  // Toggle log expansion
  const toggleLogExpansion = (index: number) => {
    setExpandedLogs((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };

  // Pagination
  const goToNextPage = () => {
    setOffset((prev) => prev + limit);
    fetchLogs(false);
  };

  const goToPreviousPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
    fetchLogs(false);
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  // Export logs as JSON
  const exportLogsAsJSON = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `convex-logs-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Logs exported successfully");
  };

  // Generate debug info for a log entry
  const generateDebugInfo = (log: LogEntry) => {
    // Extract stack trace from metadata or rawData if available
    let stackTrace = "";
    if (log.metadata?.stack) {
      stackTrace = log.metadata.stack;
    } else if (log.rawData?.stack) {
      stackTrace = log.rawData.stack;
    } else if (log.rawData?.error?.stack) {
      stackTrace = log.rawData.error.stack;
    }

    // Extract performance metrics from rawData
    const eventData = log.rawData?.data || {};
    const executionTimeMs = eventData.execution_time_ms;
    const dbReadDocs = eventData.usage?.database_read_documents;
    const dbReadBytes = eventData.usage?.database_read_bytes;
    const dbWriteBytes = eventData.usage?.database_write_bytes;
    const functionType = eventData.function?.type; // query, mutation, action

    // Build performance metrics section
    let performanceSection = "";
    if (executionTimeMs !== undefined || dbReadDocs !== undefined) {
      const metrics = [];
      if (executionTimeMs !== undefined) {
        const timeWarning = executionTimeMs > 1000 ? " ⚠️" : "";
        metrics.push(
          `- Execution Time: ${executionTimeMs.toFixed(0)}ms${timeWarning}`,
        );
      }
      if (dbReadDocs !== undefined) {
        const docsWarning = dbReadDocs > 100 ? " ⚠️" : "";
        metrics.push(`- Documents Read: ${dbReadDocs}${docsWarning}`);
      }
      if (dbReadBytes !== undefined) {
        const kb = (dbReadBytes / 1024).toFixed(2);
        metrics.push(`- Read Bandwidth: ${kb}KB`);
      }
      if (dbWriteBytes !== undefined) {
        const kb = (dbWriteBytes / 1024).toFixed(2);
        metrics.push(`- Write Bandwidth: ${kb}KB`);
      }
      if (functionType) {
        metrics.push(`- Function Type: ${functionType}`);
      }

      performanceSection = `\n**Performance Metrics:**\n${metrics.join("\n")}\n`;
    }

    // Build performance hints based on metrics
    let performanceHints = "";
    const hints = [];

    if (executionTimeMs !== undefined && executionTimeMs > 1000) {
      hints.push(
        `⚠️ **High execution time (${executionTimeMs.toFixed(0)}ms)**: This ${functionType || "function"} is taking too long. Review index usage and query patterns.`,
      );
    }

    if (dbReadDocs !== undefined && dbReadDocs > 100) {
      hints.push(`⚠️ **High document reads (${dbReadDocs} docs)**: This ${functionType || "function"} is scanning many documents.

**Should you add an index?**
- If this runs on every page load → YES, add an index
- If this runs occasionally in admin tools → MAYBE, consider if the table is growing
- If this is a one-off migration → NO, table scan is fine

💡 **Suggested optimization** (if index is justified):
\`\`\`typescript
// In schema.ts - add an index for the field you're querying
yourTable: defineTable({...})
  .index("by_field_name", ["fieldName"])

// In your query - use .withIndex() instead of .filter()
ctx.db.query("yourTable")
  .withIndex("by_field_name", q => q.eq("fieldName", args.value))
  // Add .take(N) if you don't need all results
\`\`\`
`);
    }

    // Build the Convex performance guidelines section
    const performanceGuidelines = `## Convex Performance Guidelines

When debugging Convex queries, follow these best practices:

1. **Use indexes, not filters**: Replace \`.filter()\` with \`.withIndex()\` for production queries
2. **Indexes aren't free**: They have storage and write costs. Only add indexes that are defensible:
   - ✅ Add for: Frequently-run queries, user-facing features, queries that need to scale
   - ❌ Skip for: One-off admin queries, rarely-used features, queries on small tables (<100 docs)
3. **Limit document scans**: Queries reading 100+ documents should use indexes
4. **Check index definitions**: Ensure indexes exist in schema.ts for common query patterns
5. **Optimize data fetching**: Only read fields you need, use \`.take(N)\` for pagination

Learn more: https://stack.convex.dev/queries-that-scale
`;

    const debugInfo = `# Debug Info for Error Log

**Timestamp:** ${formatTimestamp(log.timestamp)}
**Function:** ${log.functionName}
**Deployment:** ${log.deploymentName}
**Level:** ${log.level.toUpperCase()}${performanceSection}

## Error Message
\`\`\`
${log.message}
\`\`\`

${
  stackTrace
    ? `## Stack Trace
\`\`\`
${stackTrace}
\`\`\`

`
    : ""
}${performanceGuidelines}
${hints.length > 0 ? `## Performance Hints\n\n${hints.join("\n\n")}\n\n` : ""}## Raw Data
\`\`\`json
${JSON.stringify(log.rawData, null, 2)}
\`\`\`
`;

    return debugInfo;
  };

  // Copy debug info to clipboard
  const copyDebugInfo = async (log: LogEntry) => {
    try {
      const debugInfo = generateDebugInfo(log);
      await navigator.clipboard.writeText(debugInfo);
      toast.success("Debug info copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy debug info");
      console.error("Copy error:", error);
    }
  };

  // Refetch all data (tabs + logs)
  const refetchAll = useCallback(() => {
    // Trigger refetch for active tab
    setRefetchTrigger((prev) => prev + 1);
    // Trigger refetch for logs
    fetchLogs();
    toast.success("Refreshing all monitoring data...");
  }, [fetchLogs]);

  // Callback for tabs to filter logs
  const handleFilterByFunction = useCallback(
    (functionPath: string, errorsOnlyMode: boolean = true) => {
      setSearchText(functionPath);
      setErrorsOnly(errorsOnlyMode);
      if (errorsOnlyMode) {
        setSelectedLevels(new Set(["error"]));
      }
      setShouldAutoFetch(true);
      toast.info(`Filtering logs for ${functionPath}`);
    },
    [],
  );

  const handleFilterByDeployment = useCallback(
    (deploymentName: string, errorsOnlyMode: boolean = false) => {
      setSearchText(deploymentName);
      setErrorsOnly(errorsOnlyMode);
      if (errorsOnlyMode) {
        setSelectedLevels(new Set(["error"]));
      } else {
        setSelectedLevels(new Set(["info", "warn", "error", "debug"]));
      }
      setExpandedLogs(new Set());
      setShouldAutoFetch(true);
      toast.info(`Filtering logs for ${deploymentName}`);
    },
    [],
  );

  return (
    <div className="min-w-0 space-y-6">
      {/* HEADER */}
      <SectionHeader
        icon={Activity}
        title="System Monitoring & Incidents"
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-50"
        borderColor="border-indigo-200"
      />

      {/* TOP-LEVEL TABS: VLY.ai | User Projects */}
      <Tabs
        value={activeDataset}
        onValueChange={(value) => {
          setActiveDataset(value);
          setDataset(value);
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="vly-convex" className="flex items-center gap-2">
            <img src="/logo.svg" alt="vly.ai" className="h-4 w-4" />
            vly.ai
          </TabsTrigger>
          <TabsTrigger value="convex-user-usage" className="gap-2">
            User Projects
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vly-convex" className="mt-6">
          {/* SUB-TABS: Failures | Performance | Cost */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="failures" className="gap-2">
                <XCircle className="h-4 w-4" />
                Failures
              </TabsTrigger>
              <TabsTrigger value="performance" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="cost" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Cost
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Filters - Time Range */}
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Time Range
                </Label>
                <div className="flex gap-2">
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map((tr) => (
                        <SelectItem key={tr.value} value={tr.value}>
                          {tr.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={refetchAll}
                    variant="outline"
                    className="h-9 shrink-0 gap-2"
                    title="Refetch all data"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <TabsContent value="failures" className="mt-6">
              <FailuresTabContent
                dataset={dataset}
                timeRange={timeRange}
                onFilterByFunction={handleFilterByFunction}
                refetchTrigger={refetchTrigger}
              />
            </TabsContent>

            <TabsContent value="performance" className="mt-6">
              <PerformanceTabContent
                dataset={dataset}
                timeRange={timeRange}
                refetchTrigger={refetchTrigger}
              />
            </TabsContent>

            <TabsContent value="cost" className="mt-6">
              <CostTabContent
                dataset={dataset}
                timeRange={timeRange}
                refetchTrigger={refetchTrigger}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="convex-user-usage" className="mt-6">
          {/* SUB-TABS: Performance | Cost (no Failures for aggregated data) */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="performance" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="cost" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Cost
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Filters - Time Range */}
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Time Range
                </Label>
                <div className="flex gap-2">
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map((tr) => (
                        <SelectItem key={tr.value} value={tr.value}>
                          {tr.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={refetchAll}
                    variant="outline"
                    className="h-9 shrink-0 gap-2"
                    title="Refetch all data"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <TabsContent value="performance" className="mt-6">
              <PerformanceTabContent
                dataset={dataset}
                timeRange={timeRange}
                refetchTrigger={refetchTrigger}
                deploymentPauseStatus={deploymentPauseStatus}
                onFetchPauseStatuses={fetchDeploymentPauseStatuses}
                onPauseResume={handlePauseResume}
              />
            </TabsContent>

            <TabsContent value="cost" className="mt-6">
              <CostTabContent
                dataset={dataset}
                timeRange={timeRange}
                refetchTrigger={refetchTrigger}
                deploymentPauseStatus={deploymentPauseStatus}
                onFetchPauseStatuses={fetchDeploymentPauseStatuses}
                onPauseResume={handlePauseResume}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* SHARED FILTERS */}
      <div className="min-w-0 space-y-4 rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
        {/* Row 1: Dataset, Time Range, Log Levels */}
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Dataset
            </Label>
            <Select value={dataset} onValueChange={setDataset}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATASETS.map((ds) => (
                  <SelectItem key={ds.value} value={ds.value}>
                    {ds.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Time Range
            </Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((tr) => (
                  <SelectItem key={tr.value} value={tr.value}>
                    {tr.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Log Levels
            </Label>
            <div className="flex flex-wrap gap-3">
              {(["info", "warn", "error", "debug"] as LogLevel[]).map(
                (level) => (
                  <div key={level} className="flex items-center gap-2">
                    <Checkbox
                      id={`level-${level}`}
                      checked={selectedLevels.has(level)}
                      onCheckedChange={() => toggleLogLevel(level)}
                      disabled={errorsOnly && level !== "error"}
                    />
                    <Label
                      htmlFor={`level-${level}`}
                      className={`cursor-pointer text-sm font-medium capitalize ${errorsOnly && level !== "error" ? "opacity-50" : ""}`}
                    >
                      {level}
                    </Label>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Search Message, Actions, Quick Filter */}
        <div className="grid min-w-0 gap-3 md:grid-cols-4">
          <div className="min-w-0 space-y-2 md:col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Search Message
            </Label>
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    fetchLogs();
                  }
                }}
                placeholder="Search log messages..."
                className="h-9 w-full pl-9 text-sm"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Actions
            </Label>
            <div className="flex min-w-0 gap-2">
              <Button
                onClick={() => fetchLogs()}
                disabled={isLoading}
                className="h-9 min-w-0 flex-1 gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span className="truncate">Query</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 shrink-0" />
                    <span className="truncate">Query</span>
                  </>
                )}
              </Button>
              <Button
                onClick={() => fetchLogs()}
                disabled={isLoading}
                variant="outline"
                className="h-9 shrink-0 gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
              {logs.length > 0 && (
                <Button
                  onClick={exportLogsAsJSON}
                  variant="outline"
                  className="h-9 shrink-0 gap-2"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Quick Filter
            </Label>
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-full gap-2 text-xs"
              onClick={() => {
                setErrorsOnly(!errorsOnly);
                if (!errorsOnly) {
                  setSelectedLevels(new Set(["error"]));
                } else {
                  setSelectedLevels(
                    new Set(["info", "warn", "error", "debug"]),
                  );
                }
              }}
            >
              <AlertCircle
                className={`h-3 w-3 ${errorsOnly ? "text-red-600" : ""}`}
              />
              {errorsOnly ? "Show All" : "Errors Only"}
            </Button>
          </div>
        </div>
      </div>

      {/* SHARED LOGS VIEWER */}
      <div ref={logsRef} className="min-w-0 space-y-4">
        {/* Stats */}
        {!isLoading && !error && logs.length > 0 && (
          <div className="flex min-w-0 items-center justify-between text-sm text-zinc-600">
            <span>
              Showing {offset + 1}-{Math.min(offset + logs.length, totalCount)}{" "}
              of {totalCount} logs
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={goToPreviousPage}
                disabled={offset === 0 || isLoading}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={goToNextPage}
                disabled={!hasMore || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="min-w-0 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-red-900">Error</h4>
                <p className="mt-1 break-words text-sm text-red-700">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchLogs()}
                  className="mt-3 gap-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingState message="Querying logs from Axiom..." />}

        {/* Empty State */}
        {!isLoading && !error && logs.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No logs found"
            description="Try adjusting your filters or time range"
          />
        )}

        {/* Logs Table */}
        {!isLoading && !error && logs.length > 0 && (
          <div className="min-w-0 overflow-hidden rounded-lg border border-indigo-200 bg-white shadow-sm">
            <div className="w-full min-w-0">
              <table className="w-full min-w-0 table-fixed">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="w-[5%] px-3 py-2"></th>
                    <th className="w-[13%] px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                      Timestamp
                    </th>
                    <th className="w-[8%] px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                      Level
                    </th>
                    <th className="w-[22%] px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                      Source
                    </th>
                    <th className="w-[40%] px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                      Message
                    </th>
                    <th className="w-[12%] px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => {
                    const isExpanded = expandedLogs.has(index);
                    return (
                      <React.Fragment key={index}>
                        <tr className="group border-b border-zinc-100 transition-colors hover:bg-zinc-50/50">
                          {/* Expand Button */}
                          <td className="px-3 py-2.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleLogExpansion(index)}
                              className="h-6 w-6 p-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-zinc-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-zinc-500" />
                              )}
                            </Button>
                          </td>

                          {/* Timestamp */}
                          <td className="px-3 py-2.5">
                            <span className="block truncate font-mono text-xs text-zinc-600">
                              {formatTimestamp(log.timestamp)}
                            </span>
                          </td>

                          {/* Level */}
                          <td className="px-3 py-2.5">
                            <Badge
                              variant="outline"
                              className={`px-2 py-0.5 text-[10px] font-semibold uppercase ${LOG_LEVEL_COLORS[log.level]}`}
                            >
                              {log.level}
                            </Badge>
                          </td>

                          {/* Source */}
                          <td className="px-3 py-2.5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <button
                                onClick={() => {
                                  setSearchText(log.functionName);
                                  toast.info(
                                    `Filtering logs for ${log.functionName}`,
                                  );
                                }}
                                className="truncate text-left font-mono text-xs font-medium text-blue-600 hover:underline"
                              >
                                {log.functionName}
                              </button>
                              <button
                                onClick={() => {
                                  setSearchText(log.deploymentName);
                                  toast.info(
                                    `Filtering logs for ${log.deploymentName}`,
                                  );
                                }}
                                className="truncate text-left font-mono text-[10px] text-zinc-500 hover:text-blue-600 hover:underline"
                              >
                                {log.deploymentName}
                              </button>
                            </div>
                          </td>

                          {/* Message */}
                          <td className="px-3 py-2.5">
                            <p className="line-clamp-2 break-words text-xs text-zinc-700">
                              {log.message}
                            </p>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2.5">
                            {log.level === "error" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyDebugInfo(log);
                                }}
                                title="Copy debug info to clipboard"
                              >
                                <Bot className="h-3 w-3 shrink-0" />
                                <span className="whitespace-nowrap">Debug</span>
                              </Button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <tr className="border-b border-zinc-100 bg-zinc-50/50">
                            <td colSpan={6} className="px-3 py-4">
                              <div className="min-w-0 space-y-3">
                                {/* Quick Actions */}
                                <div className="flex min-w-0 flex-wrap gap-2 rounded-md border border-indigo-200 bg-indigo-50/30 p-3">
                                  <Label className="w-full text-xs font-semibold uppercase tracking-wide text-zinc-700">
                                    Quick Actions
                                  </Label>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 gap-1 text-xs"
                                    onClick={() =>
                                      handleFilterByDeployment(
                                        log.deploymentName,
                                        true,
                                      )
                                    }
                                  >
                                    <XCircle className="h-3 w-3 shrink-0" />
                                    <span className="whitespace-nowrap">
                                      Errors from this deployment
                                    </span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 gap-1 text-xs"
                                    onClick={() =>
                                      handleFilterByFunction(
                                        log.functionName,
                                        false,
                                      )
                                    }
                                  >
                                    <Search className="h-3 w-3 shrink-0" />
                                    <span className="whitespace-nowrap">
                                      All logs from this function
                                    </span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 gap-1 text-xs"
                                    onClick={() =>
                                      handleFilterByDeployment(
                                        log.deploymentName,
                                        false,
                                      )
                                    }
                                  >
                                    <Activity className="h-3 w-3 shrink-0" />
                                    <span className="whitespace-nowrap">
                                      All activity from this deployment
                                    </span>
                                  </Button>
                                  {log.level === "error" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 shrink-0 gap-1 text-xs"
                                      onClick={() => copyDebugInfo(log)}
                                      title="Copy debug info to clipboard"
                                    >
                                      <Bot className="h-3 w-3 shrink-0" />
                                      <span className="whitespace-nowrap">
                                        Debug
                                      </span>
                                    </Button>
                                  )}
                                </div>

                                {/* Full Message */}
                                <div className="min-w-0">
                                  <Label className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                                    Full Message
                                  </Label>
                                  <pre className="max-w-full overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
                                    {log.message}
                                  </pre>
                                </div>

                                {/* Metadata */}
                                {Object.keys(log.metadata).length > 0 && (
                                  <div className="min-w-0">
                                    <Label className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                                      Metadata
                                    </Label>
                                    <pre className="max-w-full overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {/* Raw Data */}
                                <div className="min-w-0">
                                  <Label className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                                    Raw Data
                                  </Label>
                                  <pre className="max-h-96 max-w-full overflow-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
                                    {JSON.stringify(log.rawData, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottom Pagination */}
        {!isLoading && !error && logs.length > 0 && (
          <div className="flex min-w-0 items-center justify-between text-sm text-zinc-600">
            <span>
              Showing {offset + 1}-{Math.min(offset + logs.length, totalCount)}{" "}
              of {totalCount} logs
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={goToPreviousPage}
                disabled={offset === 0 || isLoading}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={goToNextPage}
                disabled={!hasMore || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
