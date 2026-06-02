/**
 * Monitoring Theme Constants
 * Centralized color schemes and styling constants for monitoring components
 */

// Chart Colors - Used for metrics visualization
export const CHART_COLORS = {
  // Primary metric colors
  purple: "#8b5cf6",
  amber: "#f59e0b",
  blue: "#3b82f6",
  pink: "#ec4899",
  green: "#22c55e",

  // Chart infrastructure colors
  grid: "#e5e7eb",
  tickText: "#71717a",
  tickLine: "#e5e7eb",
} as const;

// Metric-specific color mappings for consistency
export const METRIC_COLORS = {
  // Convex metrics
  executions: CHART_COLORS.purple,
  compute: CHART_COLORS.amber,
  databaseBandwidth: CHART_COLORS.blue,
  fileBandwidth: CHART_COLORS.pink,

  // Sandbox metrics
  cpu: CHART_COLORS.purple,
  memory: CHART_COLORS.pink,
  disk: CHART_COLORS.blue,
} as const;

// Workspace tier colors - Used in upgrade/downgrade panels
export const TIER_COLORS = {
  small: {
    border: "border-zinc-300",
    bg: "bg-zinc-50",
    selectedBorder: "border-zinc-500",
    selectedBg: "bg-zinc-100",
    badge: "bg-zinc-200 text-zinc-700",
    icon: "text-zinc-500",
  },
  medium: {
    border: "border-blue-300",
    bg: "bg-blue-50",
    selectedBorder: "border-blue-500",
    selectedBg: "bg-blue-100",
    badge: "bg-blue-200 text-blue-700",
    icon: "text-blue-500",
  },
  large: {
    border: "border-purple-300",
    bg: "bg-purple-50",
    selectedBorder: "border-purple-500",
    selectedBg: "bg-purple-100",
    badge: "bg-purple-200 text-purple-700",
    icon: "text-purple-500",
  },
} as const;

// Chart configuration defaults
export const CHART_DEFAULTS = {
  // Tick styling
  tick: {
    fill: CHART_COLORS.tickText,
    fontSize: 10,
  },
  tickLine: {
    stroke: CHART_COLORS.tickLine,
  },

  // Grid styling
  cartesianGrid: {
    strokeDasharray: "3 3",
    stroke: CHART_COLORS.grid,
  },

  // Axis label styling
  axisLabel: {
    fontSize: 10,
    fill: CHART_COLORS.tickText,
  },
} as const;

// Time range configurations for monitoring dashboards
export const TIME_RANGES = [
  { label: "Last 5 minutes", value: "5m", ms: 5 * 60 * 1000 },
  { label: "Last 1 hour", value: "1h", ms: 1 * 60 * 60 * 1000 },
  { label: "Last 6 hours", value: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 24 hours", value: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", value: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

// Time formatter for charts
export const formatChartTime = (timestamp: number, includeSeconds = false) => {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds && { second: "2-digit" }),
  };
  return new Date(timestamp).toLocaleTimeString([], options);
};
