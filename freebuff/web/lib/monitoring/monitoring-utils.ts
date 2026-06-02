import type { SandboxSize } from "@/vly/lib/sandbox-specs";
import type { SandboxMetricsHistory } from "./monitoring-types";

export const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));

  // Calculate the value for the current unit
  let value = bytes / Math.pow(k, i);

  // If value >= 1000, bump up to next unit for better readability
  // e.g., show "1.00 GB" instead of "1023.93 MB"
  if (value >= 1000 && i < sizes.length - 1) {
    i++;
    value = bytes / Math.pow(k, i);
  }

  return `${value.toFixed(2)} ${sizes[i]}`;
};

export const formatBandwidthWithUnit = (bytes: number) => {
  if (bytes === 0) return { value: "0", unit: "B" };
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));

  // Calculate the value for the current unit
  let numValue = bytes / Math.pow(k, i);

  // If value >= 1000, bump up to next unit for better readability
  if (numValue >= 1000 && i < sizes.length - 1) {
    i++;
    numValue = bytes / Math.pow(k, i);
  }

  const value = numValue.toFixed(2);
  return { value, unit: sizes[i] };
};

export const formatTime = (ms: number) => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const formatCompute = (gbHours: number) => {
  if (gbHours === 0) return "0 GB-h";
  // Convert to smaller units if very small
  const mbHours = gbHours * 1024;
  if (mbHours < 1) {
    const kbHours = mbHours * 1024;
    if (kbHours < 1) {
      const bHours = kbHours * 1024;
      return `${bHours.toFixed(2)} B-h`;
    }
    return `${kbHours.toFixed(2)} KB-h`;
  }
  // Use MB-h if less than 1000, otherwise bump to GB-h for readability
  if (mbHours < 1000) {
    return `${mbHours.toFixed(2)} MB-h`;
  }
  return `${gbHours.toFixed(2)} GB-h`;
};

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

export const formatRelativeDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dateOnly.getTime() === today.getTime()) {
    return `Today ${time}`;
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday ${time}`;
  } else {
    const monthDay = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    return `${monthDay}, ${time}`;
  }
};

export const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "0m";
};

export const getProgressColor = (percentage: number) => {
  if (percentage >= 80) return "bg-red-500";
  if (percentage >= 60) return "bg-yellow-500";
  return "bg-green-500";
};

export const getTierDirection = (fromTier: string, toTier: string) => {
  const tierOrder: Record<string, number> = { small: 0, medium: 1, large: 2 };
  const from = tierOrder[fromTier] ?? 1;
  const to = tierOrder[toTier] ?? 1;
  if (to > from) return "upgrade";
  if (to < from) return "downgrade";
  return "same";
};

export const tierToSize = (tier: string): SandboxSize => {
  // Tiers now directly match sizes
  if (tier === "small" || tier === "medium" || tier === "large") {
    return tier as SandboxSize;
  }
  // Fallback for legacy tier names
  switch (tier) {
    case "free":
      return "small";
    case "hobby":
      return "medium";
    case "pro":
      return "large";
    default:
      return "small";
  }
};

// Process time series data to detect and handle gaps (sandbox stopped periods)
export const processTimeSeriesWithGaps = (
  timeSeries: SandboxMetricsHistory["timeSeries"],
) => {
  const GAP_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes - normal sampling is every 10 seconds
  type ProcessedPoint = Omit<
    SandboxMetricsHistory["timeSeries"][number],
    "cpuUsagePercent" | "memoryUsagePercent" | "diskUsagePercent"
  > & {
    cpuUsagePercent: number | null;
    memoryUsagePercent: number | null;
    diskUsagePercent: number | null;
  };
  const result: ProcessedPoint[] = [];

  for (let i = 0; i < timeSeries.length; i++) {
    const current = timeSeries[i];
    result.push(current);

    // Check if there's a gap before the next point
    if (i < timeSeries.length - 1) {
      const next = timeSeries[i + 1];
      const gap =
        new Date(next.timestamp).getTime() -
        new Date(current.timestamp).getTime();

      if (gap > GAP_THRESHOLD_MS) {
        // Insert null data point to break the line (sandbox was stopped)
        // Use a timestamp 1ms after current to avoid duplicate keys
        const gapTimestamp = new Date(
          new Date(current.timestamp).getTime() + 1,
        ).toISOString();
        result.push({
          ...current,
          timestamp: gapTimestamp,
          cpuUsagePercent: null,
          memoryUsagePercent: null,
          diskUsagePercent: null,
        });
      }
    }
  }

  return result;
};

// Calculate actual time range from data (excluding gaps/null points)
// This ensures the chart only shows periods where the sandbox was actually running
export const getActualDataTimeRange = (
  data: Array<{
    time: number;
    [key: string]: number | string | null | undefined;
  }>,
  dataKeys: string[],
): [number, number] | ["auto", "auto"] => {
  const validTimestamps = data
    .filter((point) =>
      dataKeys.some((key) => point[key] !== null && point[key] !== undefined),
    )
    .map((point) => point.time);

  if (validTimestamps.length === 0) {
    return ["auto", "auto"];
  }

  return [Math.min(...validTimestamps), Math.max(...validTimestamps)];
};
