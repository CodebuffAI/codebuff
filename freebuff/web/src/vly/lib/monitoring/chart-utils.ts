// Shared chart utility functions for consistent chart formatting

/**
 * Format timestamp for chart axes
 * @param timestamp - Unix timestamp in milliseconds
 * @param format - 'short' for HH:MM, 'full' for HH:MM:SS
 */
export function formatChartTimestamp(
  timestamp: number,
  format: "short" | "full" = "short",
): string {
  const options: Intl.DateTimeFormatOptions =
    format === "short"
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        };

  return new Date(timestamp).toLocaleTimeString([], options);
}

/**
 * Common chart configuration for styling consistency
 */
export const CHART_COLORS = {
  purple: "#8b5cf6",
  pink: "#ec4899",
  blue: "#3b82f6",
  amber: "#f59e0b",
  green: "#10b981",
  red: "#ef4444",
};

/**
 * Common chart axis configuration
 */
export const CHART_AXIS_CONFIG = {
  tick: { fill: "#71717a", fontSize: 10 },
  tickLine: { stroke: "#e5e7eb" },
};

/**
 * Common chart grid configuration
 */
export const CHART_GRID_CONFIG = {
  strokeDasharray: "3 3",
  stroke: "#e5e7eb",
};
