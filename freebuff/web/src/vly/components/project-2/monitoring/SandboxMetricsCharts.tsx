"use client";

import React, { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Skeleton } from "@/vly/components/ui/skeleton";
import type { SandboxMetricsHistory } from "@/vly/lib/monitoring/monitoring-types";
import {
  processTimeSeriesWithGaps,
  getActualDataTimeRange,
} from "@/vly/lib/monitoring/monitoring-utils";
import { processSandboxResourcesData } from "@/vly/lib/monitoring/chart-data-processors";
import { METRIC_COLORS } from "@/vly/lib/monitoring/monitoring-constants";
import EmptyState from "./shared/EmptyState";
import BaseCombinedChart from "./shared/charts/BaseCombinedChart";

interface SandboxMetricsChartsProps {
  metricsHistory: SandboxMetricsHistory | null | undefined;
  metricsLoading: boolean;
  metricsError: string | null;
}

export default function SandboxMetricsCharts({
  metricsHistory,
  metricsLoading,
  metricsError,
}: SandboxMetricsChartsProps) {
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(new Set());

  const handleToggleMetric = (metricKey: string) => {
    setHiddenMetrics((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(metricKey)) {
        newSet.delete(metricKey);
      } else {
        newSet.add(metricKey);
      }
      return newSet;
    });
  };
  return (
    <div className="space-y-3 border-t border-border pt-5">
      <h3 className="font-sans text-lg font-normal text-foreground">
        Resource Usage Over Time
      </h3>

      {/* Loading State */}
      {metricsLoading && (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      )}

      {/* Error State */}
      {metricsError && !metricsLoading && (
        <div className="rounded-2xl border border-red-300/50 bg-destructive/10 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-200/50 p-2">
              <ArrowUp className="h-4 w-4 text-red-700" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900">
                Error Loading Charts
              </h4>
              <p className="mt-1 text-xs text-red-800">{metricsError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {!metricsLoading &&
        !metricsError &&
        metricsHistory &&
        metricsHistory.timeSeries.length > 0 && (
          <div className="space-y-2">
            {/* Combined Resource Usage Chart */}
            <h4 className="text-sm font-semibold text-foreground">
              CPU, Memory & Disk Usage
            </h4>
            <div className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm backdrop-blur-sm">
              {(() => {
                const resourcesData = processSandboxResourcesData(
                  metricsHistory.timeSeries,
                  processTimeSeriesWithGaps,
                );
                const chartTimeRange = getActualDataTimeRange(resourcesData, [
                  "cpu",
                  "memory",
                  "disk",
                ]);

                return (
                  <BaseCombinedChart
                    data={resourcesData}
                    areas={[
                      {
                        dataKey: "disk",
                        stroke: METRIC_COLORS.disk,
                        fill: METRIC_COLORS.disk,
                        name: "Disk %",
                        fillOpacity: 0.2,
                      },
                    ]}
                    lines={[
                      {
                        dataKey: "cpu",
                        stroke: METRIC_COLORS.cpu,
                        name: "CPU %",
                      },
                      {
                        dataKey: "memory",
                        stroke: METRIC_COLORS.memory,
                        name: "Memory %",
                      },
                    ]}
                    chartConfig={{
                      cpu: {
                        label: "CPU %",
                        color: METRIC_COLORS.cpu,
                      },
                      memory: {
                        label: "Memory %",
                        color: METRIC_COLORS.memory,
                      },
                      disk: {
                        label: "Disk %",
                        color: METRIC_COLORS.disk,
                      },
                    }}
                    timeRange={chartTimeRange}
                    yAxes={[
                      {
                        id: "left",
                        domain: [0, 100],
                        label: "Usage %",
                        orientation: "left",
                      },
                    ]}
                    includeSeconds={true}
                    showLegend={true}
                    hiddenMetrics={hiddenMetrics}
                    onToggleMetric={handleToggleMetric}
                  />
                );
              })()}
            </div>
          </div>
        )}

      {/* Empty State */}
      {!metricsLoading &&
        !metricsError &&
        metricsHistory &&
        metricsHistory.timeSeries.length === 0 && (
          <EmptyState
            icon={ArrowUp}
            title="No metrics data available"
            description="Charts will appear here once metrics are collected"
          />
        )}
    </div>
  );
}
