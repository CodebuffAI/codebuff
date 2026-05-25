import React from "react";
import { LucideIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import ProgressBar from "./ProgressBar";

interface TopProcess {
  command: string;
  pid?: number;
  mem_kb?: number;
}

interface ResourceAccordionCardProps {
  value: string;
  icon: LucideIcon;
  label: string;
  usagePercent: number;
  limitText: string;
  topProcesses?: TopProcess[];
  formatProcessValue?: (process: TopProcess) => string;
}

export default function ResourceAccordionCard({
  value,
  icon: Icon,
  label,
  usagePercent,
  limitText,
  topProcesses = [],
  formatProcessValue,
}: ResourceAccordionCardProps) {
  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem
        value={value}
        className="overflow-hidden rounded-2xl border border-zinc-200/40 bg-white/80 shadow-sm backdrop-blur-md"
      >
        <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]]:pb-3">
          <div className="flex w-full items-start gap-3 pr-2">
            <div className="p-2">
              <Icon className="h-3.5 w-3.5 text-purple-400/60" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-700">
                  {label}
                </span>
                <span className="text-sm font-bold text-zinc-900">
                  {usagePercent.toFixed(1)}%
                </span>
              </div>
              {/* Progress Bar */}
              <div className="mt-1.5">
                <ProgressBar percentage={usagePercent} />
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">{limitText}</div>
            </div>
          </div>
        </AccordionTrigger>
        {topProcesses.length > 0 && (
          <AccordionContent className="px-4 pb-3 pt-0">
            <div className="space-y-1 border-t border-zinc-200/30 pt-2">
              {topProcesses.slice(0, 3).map((proc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[10px] text-zinc-600"
                >
                  <span className="truncate font-mono">{proc.command}</span>
                  <span className="ml-2 font-mono">
                    {formatProcessValue
                      ? formatProcessValue(proc)
                      : `PID ${proc.pid}`}
                  </span>
                </div>
              ))}
            </div>
          </AccordionContent>
        )}
      </AccordionItem>
    </Accordion>
  );
}
