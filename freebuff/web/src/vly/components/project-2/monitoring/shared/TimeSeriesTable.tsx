import React from "react";
import { ChevronDown } from "lucide-react";
import TimeSeriesCard from "./TimeSeriesCard";
import type { UsageMetricsResponse } from "@/vly/lib/monitoring/monitoring-types";

interface TimeSeriesTableProps {
  data: UsageMetricsResponse["timeSeries"];
  showAll: boolean;
  onToggleShowAll: () => void;
  maxPreviewRows?: number;
}

export default function TimeSeriesTable({
  data,
  showAll,
  onToggleShowAll,
  maxPreviewRows = 10,
}: TimeSeriesTableProps) {
  // Reverse the data to show newest first
  const reversedData = [...data].reverse();
  const displayData = showAll
    ? reversedData
    : reversedData.slice(0, maxPreviewRows);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-lg font-normal text-foreground">
          Recent Activity
        </h3>
        {data.length > maxPreviewRows && (
          <button
            onClick={onToggleShowAll}
            className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary backdrop-blur-sm transition-colors duration-200 hover:border-primary/50 hover:bg-purple-100/70"
          >
            {showAll ? "Show less" : `Show all (${data.length})`}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Compact Timeline Layout */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm  backdrop-blur-[80px]">
        {/* Mobile: Card Layout */}
        <div className="2xl:hidden">
          {displayData.map((dataPoint, idx) => (
            <TimeSeriesCard key={idx} dataPoint={dataPoint} index={idx} />
          ))}
        </div>

        {/* Desktop: Single Grid Layout - only show when there's enough space (1536px+) */}
        <div className="hidden grid-cols-[auto_auto_auto_auto_auto] gap-x-6 text-xs 2xl:grid">
          {displayData.map((dataPoint, idx) => (
            <TimeSeriesCard key={idx} dataPoint={dataPoint} index={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}
