import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/vly/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  CHART_DEFAULTS,
  formatChartTime,
} from "@/vly/lib/monitoring/monitoring-constants";

interface DataPoint {
  time: number;
  [key: string]: number | string | null | undefined;
}

interface LineConfig {
  dataKey: string;
  stroke: string;
  name: string;
  yAxisId?: "left" | "right";
  strokeWidth?: number;
}

interface YAxisConfig {
  id: "left" | "right";
  domain?: [number, number] | ["auto", "auto"];
  label?: string;
  orientation?: "left" | "right";
}

interface BaseLineChartProps {
  data: DataPoint[];
  lines: LineConfig[];
  chartConfig: Record<string, { label: string; color: string }>;
  timeRange: [number, number] | ["auto", "auto"];
  yAxes?: YAxisConfig[];
  includeSeconds?: boolean;
  showLegend?: boolean;
  className?: string;
}

export default function BaseLineChart({
  data,
  lines,
  chartConfig,
  timeRange,
  yAxes = [{ id: "left", domain: ["auto", "auto"] }],
  includeSeconds = false,
  showLegend = true,
  className = "h-[200px] w-full",
}: BaseLineChartProps) {
  return (
    <ChartContainer config={chartConfig} className={className}>
      <LineChart data={data}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.cartesianGrid.strokeDasharray}
          stroke={CHART_DEFAULTS.cartesianGrid.stroke}
        />
        <XAxis
          dataKey="time"
          type="number"
          domain={timeRange}
          scale="time"
          tickFormatter={(timestamp) =>
            formatChartTime(timestamp, includeSeconds)
          }
          tick={CHART_DEFAULTS.tick}
          tickLine={CHART_DEFAULTS.tickLine}
        />
        {yAxes.map((yAxis) => (
          <YAxis
            key={yAxis.id}
            yAxisId={yAxis.id}
            orientation={yAxis.orientation || yAxis.id}
            domain={yAxis.domain || ["auto", "auto"]}
            tick={CHART_DEFAULTS.tick}
            tickLine={CHART_DEFAULTS.tickLine}
            label={
              yAxis.label
                ? {
                    value: yAxis.label,
                    angle: yAxis.orientation === "right" ? 90 : -90,
                    position:
                      yAxis.orientation === "right"
                        ? "insideRight"
                        : "insideLeft",
                    style: CHART_DEFAULTS.axisLabel,
                  }
                : undefined
            }
          />
        ))}
        <ChartTooltip content={<ChartTooltipContent />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            yAxisId={line.yAxisId || "left"}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.stroke}
            strokeWidth={line.strokeWidth || 2}
            dot={false}
            connectNulls={false}
            name={line.name}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
