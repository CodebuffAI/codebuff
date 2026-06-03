import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import type { TimeRange } from "@/vly/lib/monitoring/monitoring-types";
import TimeRangeSelector from "./shared/TimeRangeSelector";

interface MonitoringHeaderProps {
  deploymentType: "dev" | "prod" | "all";
  setDeploymentType: (value: "dev" | "prod" | "all") => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
}

export default function MonitoringHeader({
  deploymentType,
  setDeploymentType,
  timeRange,
  setTimeRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
}: MonitoringHeaderProps) {
  return (
    <div className="relative z-10 flex min-h-12 shrink-0 flex-col gap-3 border-b border-zinc-200/40 bg-gradient-to-b from-white/45 to-transparent px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Monitoring</h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <TimeRangeSelector
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
        />
        <Tabs
          className="flex h-10 items-center justify-center text-xs"
          value={deploymentType}
          onValueChange={(value) =>
            setDeploymentType(value as "dev" | "prod" | "all")
          }
        >
          <TabsList className="grid w-full min-w-[210px] grid-cols-3 sm:w-60">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="dev">Dev</TabsTrigger>
            <TabsTrigger value="prod">Prod</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
