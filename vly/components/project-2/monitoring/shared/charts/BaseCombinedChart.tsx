import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  CHART_DEFAULTS,
  formatChartTime,
} from "@/lib/monitoring/monitoring-constants";
import ToggleableChartLegend from "./ToggleableChartLegend";

interface DataPoint {
  time: number;
  [key: string]: number | string | null | undefined;
}

interface LineConfig {
  dataKey: string;
  stroke: string;
  name: string;
  strokeWidth?: number;
}

interface AreaConfig {
  dataKey: string;
  stroke: string;
  fill: string;
  name: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

interface YAxisConfig {
  id: string;
  domain?: [number, number] | ["auto", "auto"];
  label?: string;
  orientation?: "left" | "right";
}

interface BaseCombinedChartProps {
  data: DataPoint[];
  lines?: LineConfig[];
  areas?: AreaConfig[];
  chartConfig: Record<string, { label: string; color: string }>;
  timeRange: [number, number] | ["auto", "auto"];
  yAxes?: YAxisConfig[];
  includeSeconds?: boolean;
  showLegend?: boolean;
  className?: string;
  hiddenMetrics?: Set<string>;
  onToggleMetric?: (metricKey: string) => void;
}

export default function BaseCombinedChart({
  data,
  lines = [],
  areas = [],
  chartConfig,
  timeRange,
  yAxes = [{ id: "left", domain: ["auto", "auto"] }],
  includeSeconds = false,
  showLegend = true,
  className = "h-[200px] w-full",
  hiddenMetrics = new Set(),
  onToggleMetric,
}: BaseCombinedChartProps) {
  return (
    <ChartContainer config={chartConfig} className={className}>
      <ComposedChart data={data}>
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
          allowDuplicatedCategory={false}
          minTickGap={50}
          interval="preserveStartEnd"
        />
        {yAxes.map((yAxis) => (
          <YAxis
            key={yAxis.id}
            yAxisId={yAxis.id}
            orientation={yAxis.orientation || "left"}
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
        {showLegend && onToggleMetric && (
          <Legend
            content={(props) => (
              <ToggleableChartLegend
                payload={props.payload}
                hiddenMetrics={hiddenMetrics}
                onToggleMetric={onToggleMetric}
                config={chartConfig}
              />
            )}
          />
        )}
        {areas.map((area) => {
          const isHidden = hiddenMetrics.has(area.dataKey);
          return (
            <Area
              key={area.dataKey}
              yAxisId="left"
              type="monotone"
              dataKey={area.dataKey}
              stroke={area.stroke}
              fill={area.fill}
              fillOpacity={area.fillOpacity || 0.2}
              strokeWidth={area.strokeWidth || 2}
              connectNulls={false}
              name={area.name}
              isAnimationActive={false}
              hide={isHidden}
            />
          );
        })}
        {lines.map((line) => {
          const isHidden = hiddenMetrics.has(line.dataKey);
          return (
            <Line
              key={line.dataKey}
              yAxisId="left"
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth || 2}
              dot={false}
              connectNulls={false}
              name={line.name}
              isAnimationActive={false}
              hide={isHidden}
            />
          );
        })}
      </ComposedChart>
    </ChartContainer>
  );
}
