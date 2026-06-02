"use client";

import React from "react";
import { cn } from "@/vly/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface LegendPayloadItem {
  value?: string;
  id?: string;
  type?: string;
  color?: string;
  dataKey?: any;
  [key: string]: any;
}

interface ToggleableChartLegendProps {
  payload?: LegendPayloadItem[];
  hiddenMetrics: Set<string>;
  onToggleMetric: (metricKey: string) => void;
  config: Record<string, { label: string; color: string }>;
  verticalAlign?: "top" | "bottom";
}

export default function ToggleableChartLegend({
  payload,
  hiddenMetrics,
  onToggleMetric,
  config,
  verticalAlign = "bottom",
}: ToggleableChartLegendProps) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3",
        verticalAlign === "top" ? "pb-3" : "pt-3",
      )}
    >
      {payload.map((item) => {
        const key = item.dataKey as string;
        const itemConfig = config[key];
        const isHidden = hiddenMetrics.has(key);

        return (
          <button
            key={key}
            onClick={() => onToggleMetric(key)}
            className={cn(
              "group flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 transition-all hover:border-zinc-300 hover:bg-zinc-50",
              isHidden && "opacity-50",
            )}
            type="button"
            title={
              isHidden
                ? `Show ${itemConfig?.label}`
                : `Hide ${itemConfig?.label}`
            }
          >
            {isHidden ? (
              <EyeOff className="h-3 w-3 text-zinc-400" />
            ) : (
              <Eye className="h-3 w-3 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
            <div
              className="h-2 w-2 shrink-0 rounded-[2px] transition-colors"
              style={{
                backgroundColor: isHidden ? "#d1d5db" : item.color,
              }}
            />
            <span
              className={cn("text-xs font-medium", isHidden && "line-through")}
            >
              {itemConfig?.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
