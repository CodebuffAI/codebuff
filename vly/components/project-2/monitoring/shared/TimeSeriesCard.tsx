import React from "react";
import { Zap, Cpu, Database, FileText, type LucideIcon } from "lucide-react";
import {
  formatRelativeDateTime,
  formatCompute,
} from "@/lib/monitoring/monitoring-utils";
import type { UsageMetricsResponse } from "@/lib/monitoring/monitoring-types";

interface TimeSeriesCardProps {
  dataPoint: UsageMetricsResponse["timeSeries"][number];
  index: number;
}

export default function TimeSeriesCard({
  dataPoint,
  index,
}: TimeSeriesCardProps) {
  const isEven = index % 2 === 0;
  const bgClass = isEven ? "bg-transparent" : "bg-purple-50/40";

  return (
    <>
      {/* Mobile: Stacked Card Layout */}
      <div
        className={`flex flex-col gap-2 px-3 py-2.5 transition-all duration-150 2xl:hidden ${bgClass} hover:bg-white/30`}
      >
        <div className="text-xs font-semibold text-zinc-700">
          {formatRelativeDateTime(dataPoint.timestamp)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <MetricItem
            icon={Zap}
            label="Calls"
            value={`${dataPoint.executionCount.toLocaleString()}`}
          />
          <MetricItem
            icon={Cpu}
            label="Compute"
            value={formatCompute(dataPoint.costs.compute.gbHours)}
          />
          <MetricItem
            icon={Database}
            label="DB"
            value={formatCompute(dataPoint.costs.databaseBandwidth.gb)}
          />
          <MetricItem
            icon={FileText}
            label="Files"
            value={formatCompute(dataPoint.costs.fileBandwidth.gb)}
          />
        </div>
      </div>

      {/* Desktop: Grid Items (rendered as children of parent grid) */}
      <div
        className={`col-span-1 hidden px-3 py-2.5 font-semibold text-zinc-700 transition-all duration-150 2xl:block ${bgClass} hover:bg-white/30`}
      >
        {formatRelativeDateTime(dataPoint.timestamp)}
      </div>
      <div
        className={`col-span-1 hidden px-3 py-2.5 transition-all duration-150 2xl:block ${bgClass} hover:bg-white/30`}
      >
        <MetricItem
          icon={Zap}
          label="Calls"
          value={`${dataPoint.executionCount.toLocaleString()}`}
        />
      </div>
      <div
        className={`col-span-1 hidden px-3 py-2.5 transition-all duration-150 2xl:block ${bgClass} hover:bg-white/30`}
      >
        <MetricItem
          icon={Cpu}
          label="Compute"
          value={formatCompute(dataPoint.costs.compute.gbHours)}
        />
      </div>
      <div
        className={`col-span-1 hidden px-3 py-2.5 transition-all duration-150 2xl:block ${bgClass} hover:bg-white/30`}
      >
        <MetricItem
          icon={Database}
          label="DB"
          value={formatCompute(dataPoint.costs.databaseBandwidth.gb)}
        />
      </div>
      <div
        className={`col-span-1 hidden px-3 py-2.5 transition-all duration-150 2xl:block ${bgClass} hover:bg-white/30`}
      >
        <MetricItem
          icon={FileText}
          label="Files"
          value={formatCompute(dataPoint.costs.fileBandwidth.gb)}
        />
      </div>
    </>
  );
}

interface MetricItemProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function MetricItem({ icon: Icon, label, value }: MetricItemProps) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon
        className="h-3 w-3 flex-shrink-0 text-purple-600"
        strokeWidth={2.5}
      />
      <span className="font-medium text-purple-700/70">{label}</span>
      <span className="font-mono font-semibold text-purple-900">{value}</span>
    </span>
  );
}
