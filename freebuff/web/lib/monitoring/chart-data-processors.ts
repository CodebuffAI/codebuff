import type {
  UsageMetricsResponse,
  SandboxMetricsHistory,
  TimeRange,
} from "./monitoring-types";

// Determine bucket size in milliseconds based on time range
function getBucketSize(
  timeRangeType: TimeRange,
  startTime: string,
  endTime: string,
): number {
  const durationMs =
    new Date(endTime).getTime() - new Date(startTime).getTime();

  switch (timeRangeType) {
    case "billing_cycle":
      // For billing cycle, use fine granularity to show individual events
      if (durationMs <= 2 * 60 * 60 * 1000) {
        return 5 * 60 * 1000; // 5 minutes
      } else if (durationMs <= 7 * 24 * 60 * 60 * 1000) {
        return 15 * 60 * 1000; // 15 minutes (for up to 7 days)
      } else if (durationMs <= 30 * 24 * 60 * 60 * 1000) {
        return 30 * 60 * 1000; // 30 minutes (for 7-30 days)
      } else {
        return 60 * 60 * 1000; // 1 hour (for > 30 days)
      }
    case "5m":
      return 30 * 1000; // 30 seconds
    case "1h":
      return 5 * 60 * 1000; // 5 minutes
    case "24h":
      return 60 * 60 * 1000; // 1 hour
    case "7d":
      return 6 * 60 * 60 * 1000; // 6 hours
    case "custom":
      // Auto-determine based on duration with fine granularity
      if (durationMs <= 2 * 60 * 60 * 1000) {
        // <= 2 hours
        return 5 * 60 * 1000; // 5 minutes
      } else if (durationMs <= 7 * 24 * 60 * 60 * 1000) {
        // <= 7 days
        return 15 * 60 * 1000; // 15 minutes
      } else if (durationMs <= 30 * 24 * 60 * 60 * 1000) {
        // <= 30 days
        return 30 * 60 * 1000; // 30 minutes
      } else {
        return 60 * 60 * 1000; // 1 hour
      }
  }
}

// Format time label based on bucket size
function formatTimeLabel(timestamp: number, bucketSize: number): string {
  const date = new Date(timestamp);

  // For buckets >= 1 day, show date
  if (bucketSize >= 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }

  // For buckets >= 6 hours, show time with date
  if (bucketSize >= 6 * 60 * 60 * 1000) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // For smaller buckets, show time only
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Process Convex usage data for charting with time-based bucketing
export function processConvexChartData(
  timeSeries: UsageMetricsResponse["timeSeries"],
  timeRangeType: TimeRange,
  startTime: string,
  endTime: string,
  deploymentNames?: {
    devDeploymentName?: string;
    prodDeploymentName?: string;
  },
) {
  const bucketSize = getBucketSize(timeRangeType, startTime, endTime);
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  // Check if we have dev/prod separation in the data
  const hasDeploymentTypes = timeSeries.some(
    (point) => point.deploymentType !== undefined,
  );

  // Create buckets for the entire time range
  const buckets = new Map<
    number,
    {
      time: number;
      timeLabel: string;
      timeRangeLabel: string;
      executions: number;
      devExecutions: number;
      prodExecutions: number;
      compute: number;
      dbBandwidth: number;
      fileBandwidth: number;
    }
  >();

  // Initialize all buckets with zeros
  for (
    let bucketStart = startMs;
    bucketStart < endMs;
    bucketStart += bucketSize
  ) {
    const bucketEnd = Math.min(bucketStart + bucketSize, endMs);
    buckets.set(bucketStart, {
      time: bucketStart,
      timeLabel: formatTimeLabel(bucketStart, bucketSize),
      timeRangeLabel: `${formatTimeLabel(bucketStart, bucketSize)} - ${formatTimeLabel(bucketEnd, bucketSize)}`,
      executions: 0,
      devExecutions: 0,
      prodExecutions: 0,
      compute: 0,
      dbBandwidth: 0,
      fileBandwidth: 0,
    });
  }

  // Aggregate data points into buckets
  timeSeries.forEach((point) => {
    const pointTime = new Date(point.timestamp).getTime();

    // Find which bucket this point belongs to
    const bucketStart =
      Math.floor((pointTime - startMs) / bucketSize) * bucketSize + startMs;

    const bucket = buckets.get(bucketStart);
    if (bucket) {
      bucket.executions += point.executionCount;

      // Track dev/prod separately if deployment type is available
      if (hasDeploymentTypes && point.deploymentType) {
        if (point.deploymentType === "dev") {
          bucket.devExecutions += point.executionCount;
        } else if (point.deploymentType === "prod") {
          bucket.prodExecutions += point.executionCount;
        }
      }

      bucket.compute += point.costs.compute.gbHours;
      bucket.dbBandwidth +=
        (point.dbReadBytes + point.dbWriteBytes) / (1024 * 1024 * 1024);
      bucket.fileBandwidth +=
        (point.fileStorageReadBytes + point.fileStorageWriteBytes) /
        (1024 * 1024 * 1024);
    }
  });

  const convexUsageData = Array.from(buckets.values()).sort(
    (a, b) => a.time - b.time,
  );

  const timeRange: [number, number] | ["auto", "auto"] =
    convexUsageData.length > 0 ? [startMs, endMs] : ["auto", "auto"];

  // Calculate Y-axis domain with minimal padding
  const maxExecutions = Math.max(
    ...convexUsageData.map((d) => d.executions),
    0,
  );
  const executionsMax = maxExecutions * 1.05 || 1;

  return {
    data: convexUsageData,
    timeRange,
    executionsMax,
    hasDeploymentTypes,
    devDeploymentName: deploymentNames?.devDeploymentName,
    prodDeploymentName: deploymentNames?.prodDeploymentName,
  };
}

// Process sandbox CPU & Memory data for charting
export function processSandboxCpuMemoryData(
  timeSeries: SandboxMetricsHistory["timeSeries"],
  processWithGaps: (timeSeries: SandboxMetricsHistory["timeSeries"]) => Array<{
    timestamp: string;
    cpuUsagePercent: number | null;
    memoryUsagePercent: number | null;
    diskUsagePercent: number | null;
    [key: string]: number | string | null;
  }>,
) {
  const processed = processWithGaps(timeSeries).map((point) => ({
    time: new Date(point.timestamp).getTime(),
    cpu:
      point.cpuUsagePercent !== null ? point.cpuUsagePercent.toFixed(1) : null,
    memory:
      point.memoryUsagePercent !== null
        ? point.memoryUsagePercent.toFixed(1)
        : null,
  }));

  // Deduplicate by timestamp
  const seen = new Set<number>();
  return processed.filter((point) => {
    if (seen.has(point.time)) return false;
    seen.add(point.time);
    return true;
  });
}

// Process sandbox disk data for charting
export function processSandboxDiskData(
  timeSeries: SandboxMetricsHistory["timeSeries"],
  processWithGaps: (timeSeries: SandboxMetricsHistory["timeSeries"]) => Array<{
    timestamp: string;
    diskUsagePercent: number | null;
    [key: string]: number | string | null;
  }>,
) {
  const processed = processWithGaps(timeSeries).map((point) => ({
    time: new Date(point.timestamp).getTime(),
    disk: point.diskUsagePercent,
  }));

  // Deduplicate by timestamp
  const seen = new Set<number>();
  return processed.filter((point) => {
    if (seen.has(point.time)) return false;
    seen.add(point.time);
    return true;
  });
}

// Process combined sandbox resources data (CPU, Memory, Disk) for charting
export function processSandboxResourcesData(
  timeSeries: SandboxMetricsHistory["timeSeries"],
  processWithGaps: (timeSeries: SandboxMetricsHistory["timeSeries"]) => Array<{
    timestamp: string;
    cpuUsagePercent: number | null;
    memoryUsagePercent: number | null;
    diskUsagePercent: number | null;
    [key: string]: number | string | null;
  }>,
) {
  const processed = processWithGaps(timeSeries).map((point) => ({
    time: new Date(point.timestamp).getTime(),
    cpu:
      point.cpuUsagePercent !== null ? point.cpuUsagePercent.toFixed(1) : null,
    memory:
      point.memoryUsagePercent !== null
        ? point.memoryUsagePercent.toFixed(1)
        : null,
    disk: point.diskUsagePercent,
  }));

  // Deduplicate by timestamp to prevent duplicate keys in chart
  const seen = new Set<number>();
  return processed.filter((point) => {
    if (seen.has(point.time)) {
      return false;
    }
    seen.add(point.time);
    return true;
  });
}

// Calculate current resource usage from sandbox stats
export function calculateCurrentUsage(sandboxStats: {
  cpu: { usage_percent: number; limit_cores: number };
  memory: { used_bytes: number };
  disk: { used_bytes: number };
}) {
  // CPU: Convert usage percentage and limit to actual cores
  const cpuUsageCores =
    (sandboxStats.cpu.usage_percent / 100) * sandboxStats.cpu.limit_cores;

  // RAM: Convert bytes to GB
  const ramUsageGB = sandboxStats.memory.used_bytes / (1024 * 1024 * 1024);

  // Disk: Convert bytes to GB
  const diskUsageGB = sandboxStats.disk.used_bytes / (1024 * 1024 * 1024);

  return {
    cpu: cpuUsageCores,
    ram: ramUsageGB,
    disk: diskUsageGB,
  };
}
