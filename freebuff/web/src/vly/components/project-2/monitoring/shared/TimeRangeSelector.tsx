import React from "react";
import { Calendar } from "lucide-react";
import type { TimeRange } from "@/vly/lib/monitoring/monitoring-types";

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
}

export default function TimeRangeSelector({
  timeRange,
  setTimeRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
}: TimeRangeSelectorProps) {
  return (
    <div className="space-y-3">
      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={timeRange}
          onChange={(e) => {
            e.stopPropagation();
            setTimeRange(e.target.value as TimeRange);
          }}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="billing_cycle">Current Billing Cycle</option>
          <option value="5m">Last 5 Minutes</option>
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {/* Custom Date Range Inputs */}
      {timeRange === "custom" && (
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={customStartDate}
            onChange={(e) => {
              e.stopPropagation();
              setCustomStartDate(e.target.value);
            }}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Start time"
          />
          <input
            type="datetime-local"
            value={customEndDate}
            onChange={(e) => {
              e.stopPropagation();
              setCustomEndDate(e.target.value);
            }}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="End time"
          />
        </div>
      )}
    </div>
  );
}
