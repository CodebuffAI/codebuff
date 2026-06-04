import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/vly/components/ui/chart";
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  CHART_DEFAULTS,
  formatChartTime,
} from "@/vly/lib/monitoring/monitoring-constants";

interface DataPoint {
  time: number;
  [key: string]: number | string | null | undefined;
}

interface BarConfig {
  dataKey: string;
  fill: string;
  name: string;
  stackId?: string;
}

interface BaseBarChartProps {
  data: DataPoint[];
  bars: BarConfig[];
  chartConfig: Record<string, { label: string; color: string }>;
  timeRange: [number, number] | ["auto", "auto"];
  yAxisDomain?: [number, number] | ["auto", "auto"];
  yAxisLabel?: string;
  customTooltip?: any;
  includeSeconds?: boolean;
  className?: string;
  showLegend?: boolean;
}

export default function BaseBarChart({
  data,
  bars,
  chartConfig,
  timeRange,
  yAxisDomain = ["auto", "auto"],
  yAxisLabel,
  customTooltip,
  includeSeconds = false,
  className = "h-[280px] w-full",
  showLegend = false,
}: BaseBarChartProps) {
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
        />
        <YAxis
          domain={yAxisDomain}
          tick={CHART_DEFAULTS.tick}
          tickLine={CHART_DEFAULTS.tickLine}
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: CHART_DEFAULTS.axisLabel,
                }
              : undefined
          }
        />
        {customTooltip ? (
          <ChartTooltip content={customTooltip} />
        ) : (
          <ChartTooltip />
        )}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            fill={bar.fill}
            name={bar.name}
            stackId={bar.stackId}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}
