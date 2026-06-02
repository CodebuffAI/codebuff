import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type {
  UsageMetricsResponse,
  SandboxMetricsHistory,
} from "@/vly/lib/monitoring/monitoring-types";
import type { SandboxStats } from "@/vly/codebase-utils/codebase/Codebase";

interface UseMonitoringMetricsParams {
  projectId: Id<"project"> | undefined;
  deploymentType: "dev" | "prod" | "all";
  convexTimeRange: {
    startTime: string;
    endTime: string;
  } | null;
  sandboxTimeRange: {
    startTime: string;
    endTime: string;
  } | null;
  statsMonitoringEnabled?: boolean;
}

export function useMonitoringMetrics({
  projectId,
  deploymentType,
  convexTimeRange,
  sandboxTimeRange,
  statsMonitoringEnabled = true,
}: UseMonitoringMetricsParams): {
  metrics: UsageMetricsResponse | undefined;
  sandboxStats: SandboxStats | null | undefined;
  metricsHistory: SandboxMetricsHistory | null | undefined;
  loading: {
    metrics: boolean;
    sandboxStats: boolean;
    metricsHistory: boolean;
  };
  fetching: {
    metrics: boolean;
    sandboxStats: boolean;
    metricsHistory: boolean;
  };
  errors: {
    metrics: string | null;
    sandboxStats: string | null;
    metricsHistory: string | null;
  };
} {
  const getUsageMetrics = useAction(api.monitoring.getUsageMetrics);
  const getSandboxStats = useAction(api.monitoring.getSandboxStats);
  const getSandboxMetricsHistory = useAction(
    api.monitoring.getSandboxMetricsHistory,
  );

  // Fetch usage metrics with 10s polling
  const usageMetricsQuery = useQuery({
    queryKey: [
      "usageMetrics",
      projectId,
      deploymentType,
      convexTimeRange?.startTime,
      convexTimeRange?.endTime,
    ],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      return await getUsageMetrics({
        projectId,
        deploymentType,
        startTime: convexTimeRange?.startTime,
        endTime: convexTimeRange?.endTime,
      });
    },
    enabled: !!projectId,
    refetchInterval: 10000, // 10 seconds
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });

  // Fetch sandbox stats with 10s polling
  const sandboxStatsQuery = useQuery({
    queryKey: ["sandboxStats", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      return await getSandboxStats({
        projectId,
      });
    },
    enabled: !!projectId && statsMonitoringEnabled,
    refetchInterval: 10000, // 10 seconds
  });

  // Fetch sandbox metrics history with 10s polling
  const metricsHistoryQuery = useQuery({
    queryKey: [
      "sandboxMetricsHistory",
      projectId,
      sandboxTimeRange?.startTime,
      sandboxTimeRange?.endTime,
    ],
    queryFn: async () => {
      if (!projectId || !sandboxTimeRange) {
        throw new Error("No project ID or invalid time range");
      }
      return await getSandboxMetricsHistory({
        projectId,
        startTime: sandboxTimeRange.startTime,
        endTime: sandboxTimeRange.endTime,
      });
    },
    enabled: !!projectId && !!sandboxTimeRange && statsMonitoringEnabled,
    refetchInterval: 10000, // 10 seconds
  });

  return {
    metrics: usageMetricsQuery.data,
    sandboxStats: sandboxStatsQuery.data,
    metricsHistory: metricsHistoryQuery.data,
    loading: {
      metrics: usageMetricsQuery.isLoading,
      sandboxStats: sandboxStatsQuery.isLoading,
      metricsHistory: metricsHistoryQuery.isLoading,
    },
    fetching: {
      metrics: usageMetricsQuery.isFetching,
      sandboxStats: sandboxStatsQuery.isFetching,
      metricsHistory: metricsHistoryQuery.isFetching,
    },
    errors: {
      metrics:
        usageMetricsQuery.error instanceof Error
          ? usageMetricsQuery.error.message
          : usageMetricsQuery.error
            ? String(usageMetricsQuery.error)
            : null,
      sandboxStats:
        sandboxStatsQuery.error instanceof Error
          ? sandboxStatsQuery.error.message
          : sandboxStatsQuery.error
            ? String(sandboxStatsQuery.error)
            : null,
      metricsHistory:
        metricsHistoryQuery.error instanceof Error
          ? metricsHistoryQuery.error.message
          : metricsHistoryQuery.error
            ? String(metricsHistoryQuery.error)
            : null,
    },
  };
}
