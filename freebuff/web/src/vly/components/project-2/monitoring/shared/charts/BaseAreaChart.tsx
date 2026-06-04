import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/vly/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  CHART_DEFAULTS,
  formatChartTime,
} from "@/vly/lib/monitoring/monitoring-constants";

interface DataPoint {
  time: number;
  [key: string]: number | string | null | undefined;
}

interface AreaConfig {
  dataKey: string;
  stroke: string;
  fill: string;
  name: string;
  yAxisId?: "left" | "right";
  fillOpacity?: number;
  strokeWidth?: number;
}

interface YAxisConfig {
  id: "left" | "right";
  domain?: [number, number] | ["auto", "auto"];
  label?: string;
  orientation?: "left" | "right";
}

interface BaseAreaChartProps {
  data: DataPoint[];
  areas: AreaConfig[];
  chartConfig: Record<string, { label: string; color: string }>;
  timeRange: [number, number] | ["auto", "auto"];
  yAxes?: YAxisConfig[];
  includeSeconds?: boolean;
  className?: string;
}

export default function BaseAreaChart({
  data,
  areas,
  chartConfig,
  timeRange,
  yAxes = [{ id: "left", domain: ["auto", "auto"] }],
  includeSeconds = false,
  className = "h-[200px] w-full",
}: BaseAreaChartProps) {
  return (
    <ChartContainer config={chartConfig} className={className}>
      <AreaChart data={data}>
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
        {areas.map((area) => (
          <Area
            key={area.dataKey}
            yAxisId={area.yAxisId || "left"}
            type="monotone"
            dataKey={area.dataKey}
            stroke={area.stroke}
            fill={area.fill}
            fillOpacity={area.fillOpacity || 0.2}
            strokeWidth={area.strokeWidth || 2}
            connectNulls={false}
            name={area.name}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
