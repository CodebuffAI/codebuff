"use client";

import React from "react";
import { Activity, Zap, Cpu, Database, FileText } from "lucide-react";
import type {
  UsageMetricsResponse,
  TimeRange,
} from "@/lib/monitoring/monitoring-types";
import {
  formatBytes,
  formatTime,
  formatCompute,
} from "@/lib/monitoring/monitoring-utils";
import { processConvexChartData } from "@/lib/monitoring/chart-data-processors";
import { METRIC_COLORS } from "@/lib/monitoring/monitoring-constants";
import MonitoringSectionAccordion from "./shared/MonitoringSectionAccordion";
import MetricRow from "./shared/MetricRow";
import EmptyState from "./shared/EmptyState";
import TimeSeriesTable from "./shared/TimeSeriesTable";
import BaseBarChart from "./shared/charts/BaseBarChart";
import ConvexUsageTooltip from "./shared/charts/ConvexUsageTooltip";

interface ConvexUsageSectionProps {
  metrics: UsageMetricsResponse;
  showAllTimeSeries: boolean;
  setShowAllTimeSeries: (show: boolean) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  timeRangeValues: { startTime: string; endTime: string } | null;
}

export default function ConvexUsageSection({
  metrics,
  showAllTimeSeries,
  setShowAllTimeSeries,
  timeRange,
  customStartDate,
  customEndDate,
  timeRangeValues,
}: ConvexUsageSectionProps) {
  return (
    <MonitoringSectionAccordion
      value="convex"
      icon={<img src="/convex-color.svg" alt="Convex" className="h-5 w-5" />}
      title="Convex Usage"
      badge={metrics.deploymentName}
    >
      {/* Usage & Data Transfer */}
      <div className="space-y-3">
        <h3 className="font-['PP_Cirka'] text-lg font-normal text-zinc-800">
          Usage & Data Transfer
        </h3>
        {/* Unified Card - Billable Metrics Emphasized */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200/40 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
          <div className="flex-1 space-y-0 divide-y divide-zinc-200/50">
            {/* Function Calls */}
            <MetricRow
              icon={Zap}
              label="Function Calls"
              value={`${metrics.summary.totalExecutions.toLocaleString()} ${metrics.summary.totalExecutions === 1 ? "call" : "calls"}`}
              details={`Avg: ${formatTime(metrics.summary.avgExecutionTimeMs)} · Memory: ${metrics.summary.totalActionMemoryMb} MB`}
            />

            {/* Compute */}
            <MetricRow
              icon={Cpu}
              label="Compute"
              value={formatCompute(metrics.costs.compute.gbHours)}
              details={`Total time: ${formatTime(metrics.summary.totalExecutions * metrics.summary.avgExecutionTimeMs)}`}
            />

            {/* Database BW */}
            <MetricRow
              icon={Database}
              label="Database BW"
              value={formatCompute(metrics.costs.databaseBandwidth.gb)}
              details={`Read: ${formatBytes(metrics.summary.totalDbReadBytes)} (${metrics.summary.totalDbReadDocuments.toLocaleString()} docs) · Write: ${formatBytes(metrics.summary.totalDbWriteBytes)}`}
            />

            {/* File BW */}
            <MetricRow
              icon={FileText}
              label="File BW"
              value={formatCompute(metrics.costs.fileBandwidth.gb)}
              details={`Read: ${formatBytes(metrics.summary.totalFileStorageReadBytes)} · Write: ${formatBytes(metrics.summary.totalFileStorageWriteBytes)}`}
            />
          </div>
        </div>
      </div>

      {/* Time Series Data */}
      {metrics.timeSeries.length > 0 && (
        <div className="min-w-0">
          <TimeSeriesTable
            data={metrics.timeSeries}
            showAll={showAllTimeSeries}
            onToggleShowAll={() => setShowAllTimeSeries(!showAllTimeSeries)}
          />
        </div>
      )}

      {/* Convex Usage Over Time Graph */}
      {metrics.timeSeries.length > 0 && (
        <div className="min-w-0 space-y-3">
          <h3 className="font-['PP_Cirka'] text-lg font-normal text-zinc-800">
            Usage Over Time
          </h3>
          <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-white/30 p-4 shadow-sm backdrop-blur-sm">
            {(() => {
              // Use the time range values from the parent component (calculated by useTimeRange hook)
              // This ensures the chart X-axis matches the actual data fetched and displayed
              if (!timeRangeValues) {
                return null;
              }

              const {
                data: convexUsageData,
                timeRange: chartTimeRange,
                executionsMax,
                hasDeploymentTypes,
                devDeploymentName,
                prodDeploymentName,
              } = processConvexChartData(
                metrics.timeSeries,
                timeRange,
                timeRangeValues.startTime,
                timeRangeValues.endTime,
                {
                  devDeploymentName: metrics.devDeploymentName,
                  prodDeploymentName: metrics.prodDeploymentName,
                },
              );

              // Define bars based on whether we have deployment type separation
              const bars = hasDeploymentTypes
                ? [
                    {
                      dataKey: "devExecutions",
                      fill: "#8b5cf6", // Purple for dev
                      name: "Dev Function Calls",
                      stackId: "executions",
                    },
                    {
                      dataKey: "prodExecutions",
                      fill: "#3b82f6", // Blue for prod
                      name: "Prod Function Calls",
                      stackId: "executions",
                    },
                  ]
                : [
                    {
                      dataKey: "executions",
                      fill: METRIC_COLORS.executions,
                      name: "Function Calls",
                    },
                  ];

              // Format single deployment label with Dev/Prod prefix
              const singleDeploymentLabel =
                metrics.deploymentType === "dev" ||
                metrics.deploymentType === "prod"
                  ? `${metrics.deploymentType === "dev" ? "Dev" : "Prod"} (${metrics.deploymentName})`
                  : metrics.deploymentName || "Function Calls";

              const chartConfig: Record<
                string,
                { label: string; color: string }
              > = hasDeploymentTypes
                ? {
                    devExecutions: {
                      label: `Dev${devDeploymentName ? ` (${devDeploymentName})` : ""}`,
                      color: "#8b5cf6",
                    },
                    prodExecutions: {
                      label: `Prod${prodDeploymentName ? ` (${prodDeploymentName})` : ""}`,
                      color: "#3b82f6",
                    },
                    compute: {
                      label: "Compute (GB-hrs)",
                      color: METRIC_COLORS.compute,
                    },
                    dbBandwidth: {
                      label: "Database BW (GB)",
                      color: METRIC_COLORS.databaseBandwidth,
                    },
                    fileBandwidth: {
                      label: "File BW (GB)",
                      color: METRIC_COLORS.fileBandwidth,
                    },
                  }
                : {
                    executions: {
                      label: singleDeploymentLabel,
                      color: METRIC_COLORS.executions,
                    },
                    compute: {
                      label: "Compute (GB-hrs)",
                      color: METRIC_COLORS.compute,
                    },
                    dbBandwidth: {
                      label: "Database BW (GB)",
                      color: METRIC_COLORS.databaseBandwidth,
                    },
                    fileBandwidth: {
                      label: "File BW (GB)",
                      color: METRIC_COLORS.fileBandwidth,
                    },
                  };

              return (
                <BaseBarChart
                  data={convexUsageData}
                  bars={bars}
                  chartConfig={chartConfig}
                  timeRange={chartTimeRange}
                  yAxisDomain={[0, executionsMax]}
                  yAxisLabel="Function Calls"
                  customTooltip={ConvexUsageTooltip}
                  showLegend={true}
                />
              );
            })()}
          </div>
        </div>
      )}

      {metrics.timeSeries.length === 0 && (
        <EmptyState
          icon={Activity}
          title="No activity data yet"
          description="Usage metrics will appear here once your deployment is active"
        />
      )}
    </MonitoringSectionAccordion>
  );
}
