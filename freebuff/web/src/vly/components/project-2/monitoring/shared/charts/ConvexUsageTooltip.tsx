import React from "react";
import { formatBandwidthWithUnit } from "@/vly/lib/monitoring/monitoring-utils";
import { METRIC_COLORS } from "@/vly/lib/monitoring/monitoring-constants";

interface ConvexUsageTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      time: number;
      timeLabel: string;
      timeRangeLabel: string;
      executions: number;
      devExecutions?: number;
      prodExecutions?: number;
      compute: number;
      dbBandwidth: number;
      fileBandwidth: number;
    };
  }>;
}

export default function ConvexUsageTooltip({
  active,
  payload,
}: ConvexUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  // Check if we have dev/prod separation
  const hasDeploymentTypes =
    data.devExecutions !== undefined && data.prodExecutions !== undefined;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        {data.timeRangeLabel || data.timeLabel}
      </p>
      <div className="space-y-1.5">
        {hasDeploymentTypes ? (
          <>
            {data.devExecutions! > 0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: "#8b5cf6" }}
                  />
                  <span className="text-xs text-foreground">
                    Dev Function Calls
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {data.devExecutions!.toFixed(0)}
                </span>
              </div>
            )}
            {data.prodExecutions! > 0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: "#3b82f6" }}
                  />
                  <span className="text-xs text-foreground">
                    Prod Function Calls
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {data.prodExecutions!.toFixed(0)}
                </span>
              </div>
            )}
            {data.executions > 0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: METRIC_COLORS.executions }}
                  />
                  <span className="text-xs text-foreground">
                    Total Function Calls
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {data.executions.toFixed(0)}
                </span>
              </div>
            )}
          </>
        ) : (
          data.executions > 0 && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: METRIC_COLORS.executions }}
                />
                <span className="text-xs text-foreground">Function Calls</span>
              </div>
              <span className="text-xs font-semibold text-foreground">
                {data.executions.toFixed(0)}
              </span>
            </div>
          )
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: METRIC_COLORS.compute }}
            />
            <span className="text-xs text-foreground">Compute (GB-hrs)</span>
          </div>
          <span className="text-xs font-semibold text-foreground">
            {data.compute.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: METRIC_COLORS.databaseBandwidth }}
            />
            <span className="text-xs text-foreground">Database BW</span>
          </div>
          <span className="text-xs font-semibold text-foreground">
            {(() => {
              const bytes = data.dbBandwidth * 1024 * 1024 * 1024;
              const formatted = formatBandwidthWithUnit(bytes);
              return `${formatted.value} ${formatted.unit}`;
            })()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: METRIC_COLORS.fileBandwidth }}
            />
            <span className="text-xs text-foreground">File BW</span>
          </div>
          <span className="text-xs font-semibold text-foreground">
            {(() => {
              const bytes = data.fileBandwidth * 1024 * 1024 * 1024;
              const formatted = formatBandwidthWithUnit(bytes);
              return `${formatted.value} ${formatted.unit}`;
            })()}
          </span>
        </div>
      </div>
    </div>
  );
}
