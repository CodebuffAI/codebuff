import React from "react";
import { Cpu, MemoryStick, HardDrive, Gauge } from "lucide-react";
import type { SandboxStats } from "@/vly/codebase-utils/codebase/Codebase";
import { formatBytes } from "@/vly/lib/monitoring/monitoring-utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";
import ProgressBar from "./shared/ProgressBar";

interface SandboxResourceStatsProps {
  sandboxStats: SandboxStats;
}

export default function SandboxResourceStats({
  sandboxStats,
}: SandboxResourceStatsProps) {
  return (
    <div className="space-y-3">
      {/* Resources */}
      <h3 className="text-base font-semibold text-foreground">
        Resources
      </h3>

      {/* Unified Resources Card */}
      <div className="overflow-hidden rounded-lg border border-border bg-muted/15">
        <Accordion type="multiple" className="w-full">
          {/* CPU Usage */}
          <AccordionItem
            value="cpu"
            className="border-b border-border last:border-b-0"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]]:pb-3">
              <div className="flex w-full items-start gap-3 pr-2">
                <div className="p-2">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      CPU Usage
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {sandboxStats.cpu.usage_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar percentage={sandboxStats.cpu.usage_percent} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {sandboxStats.cpu.limit_cores.toFixed(2)} cores
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            {sandboxStats.cpu.top_processes &&
              sandboxStats.cpu.top_processes.length > 0 && (
                <AccordionContent className="px-4 pb-3 pt-0">
                  <div className="space-y-1 border-t border-border pt-2">
                    {sandboxStats.cpu.top_processes
                      .slice(0, 3)
                      .map((proc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">
                            {proc.command}
                          </span>
                          <span className="flex-shrink-0 font-mono">
                            PID {proc.pid}
                          </span>
                        </div>
                      ))}
                  </div>
                </AccordionContent>
              )}
          </AccordionItem>

          {/* Memory Usage */}
          <AccordionItem
            value="memory"
            className="border-b border-border last:border-b-0"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]]:pb-3">
              <div className="flex w-full items-start gap-3 pr-2">
                <div className="p-2">
                  <MemoryStick className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Memory Usage
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {sandboxStats.memory.usage_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      percentage={sandboxStats.memory.usage_percent}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatBytes(sandboxStats.memory.used_bytes)} /{" "}
                    {formatBytes(sandboxStats.memory.limit_bytes)}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            {sandboxStats.memory.top_processes &&
              sandboxStats.memory.top_processes.length > 0 && (
                <AccordionContent className="px-4 pb-3 pt-0">
                  <div className="space-y-1 border-t border-border pt-2">
                    {sandboxStats.memory.top_processes
                      .slice(0, 3)
                      .map((proc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">
                            {proc.command}
                          </span>
                          <span className="flex-shrink-0 font-mono">
                            {proc.mem_kb
                              ? formatBytes(proc.mem_kb * 1024)
                              : "N/A"}
                          </span>
                        </div>
                      ))}
                  </div>
                </AccordionContent>
              )}
          </AccordionItem>

          {/* Disk Usage */}
          <AccordionItem
            value="disk"
            className="border-b border-border last:border-b-0"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]]:pb-3">
              <div className="flex w-full items-start gap-3 pr-2">
                <div className="p-2">
                  <HardDrive className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Disk Usage
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {sandboxStats.disk.usage_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar percentage={sandboxStats.disk.usage_percent} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatBytes(sandboxStats.disk.used_bytes)} /{" "}
                    {formatBytes(sandboxStats.disk.available_bytes)}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 pt-0">
              <div className="space-y-2 border-t border-border pt-2">
                {/* Disk Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Used</span>
                    <div className="font-mono font-semibold text-foreground">
                      {formatBytes(sandboxStats.disk.used_bytes)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Available</span>
                    <div className="font-mono font-semibold text-foreground">
                      {formatBytes(sandboxStats.disk.available_bytes)}
                    </div>
                  </div>
                </div>
                {/* System Load */}
                <div className="space-y-0.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  <div>Total: {formatBytes(sandboxStats.disk.size_bytes)}</div>
                  <div className="flex items-center gap-1.5">
                    <Gauge className="h-2.5 w-2.5" />
                    <span>Load:</span>
                    <span className="font-mono">
                      {sandboxStats.system_load["1min"].toFixed(2)} /{" "}
                      {sandboxStats.system_load["5min"].toFixed(2)} /{" "}
                      {sandboxStats.system_load["15min"].toFixed(2)}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>1m / 5m / 15m</span>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
