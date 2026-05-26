"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";
import { DollarSign, Activity, Clock, Database, HardDrive } from "lucide-react";
import { Badge } from "@/vly/components/ui/badge";
import { CONVEX_PRICING } from "@/convex/lib/convex_pricing";
import { cn } from "@/vly/lib/utils";

interface CostBreakdownAccordionProps {
  totalExecutions: number;
  estimatedTotalCost: number;
  functionCallsCost: number;
  computeCost: number;
  computeGBHours: number;
  dbBandwidthCost: number;
  dbBandwidthGB: number;
  fileBandwidthCost: number;
  fileBandwidthGB: number;
  className?: string;
}

export function CostBreakdownAccordion({
  totalExecutions,
  estimatedTotalCost,
  functionCallsCost,
  computeCost,
  computeGBHours,
  dbBandwidthCost,
  dbBandwidthGB,
  fileBandwidthCost,
  fileBandwidthGB,
  className,
}: CostBreakdownAccordionProps) {
  const pricing = CONVEX_PRICING.PROFESSIONAL.OVERAGE;
  const functionCallsInMillions = totalExecutions / 1_000_000;

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatNumber = (num: number, decimals = 2) => {
    if (num === 0) return "0";
    if (num < 0.01 && num > 0) return num.toFixed(6);
    return num.toFixed(decimals);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-yellow-500/20 bg-yellow-500/5",
        className,
      )}
    >
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-yellow-500" />
            <h3 className="text-sm font-semibold">Cost Breakdown</h3>
          </div>
          <Badge
            variant="outline"
            className="border-yellow-500/30 text-yellow-600"
          >
            {formatCost(estimatedTotalCost)} total
          </Badge>
        </div>

        <Accordion type="multiple" className="space-y-2">
          {/* Function Calls Cost */}
          <AccordionItem
            value="function-calls"
            className="rounded-lg border bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center justify-between pr-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Function Calls</span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {formatCost(functionCallsCost)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
                  <div className="mb-2 text-muted-foreground">Formula:</div>
                  <div className="text-foreground">
                    ${pricing.FUNCTION_CALLS_PER_MILLION.toFixed(2)} × (
                    {totalExecutions.toLocaleString()} calls ÷ 1,000,000) ={" "}
                    <span className="font-semibold text-yellow-600">
                      {formatCost(functionCallsCost)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total Executions:
                    </span>
                    <span className="font-medium">
                      {totalExecutions.toLocaleString()} calls
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate:</span>
                    <span className="font-medium">
                      ${pricing.FUNCTION_CALLS_PER_MILLION.toFixed(2)} per 1M
                      calls
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Millions of calls:
                    </span>
                    <span className="font-medium">
                      {formatNumber(functionCallsInMillions, 3)}M
                    </span>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Compute Cost */}
          <AccordionItem
            value="compute"
            className="rounded-lg border bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center justify-between pr-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Compute</span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {formatCost(computeCost)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
                  <div className="mb-2 text-muted-foreground">Formula:</div>
                  <div className="text-foreground">
                    ${pricing.COMPUTE_PER_GB_HOUR.toFixed(2)} ×{" "}
                    {formatNumber(computeGBHours, 4)} GB-hours ={" "}
                    <span className="font-semibold text-yellow-600">
                      {formatCost(computeCost)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GB-hours:</span>
                    <span className="font-medium">
                      {formatNumber(computeGBHours, 4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate:</span>
                    <span className="font-medium">
                      ${pricing.COMPUTE_PER_GB_HOUR.toFixed(2)} per GB-hour
                    </span>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Database Bandwidth Cost */}
          <AccordionItem
            value="database-bandwidth"
            className="rounded-lg border bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center justify-between pr-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Database Bandwidth
                  </span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {formatCost(dbBandwidthCost)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
                  <div className="mb-2 text-muted-foreground">Formula:</div>
                  <div className="text-foreground">
                    ${pricing.DATABASE_BANDWIDTH_PER_GB.toFixed(2)} ×{" "}
                    {formatNumber(dbBandwidthGB, 4)} GB ={" "}
                    <span className="font-semibold text-yellow-600">
                      {formatCost(dbBandwidthCost)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Bandwidth (GB):
                    </span>
                    <span className="font-medium">
                      {formatNumber(dbBandwidthGB, 4)} GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate:</span>
                    <span className="font-medium">
                      ${pricing.DATABASE_BANDWIDTH_PER_GB.toFixed(2)} per GB
                    </span>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* File Bandwidth Cost */}
          <AccordionItem
            value="file-bandwidth"
            className="rounded-lg border bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center justify-between pr-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">File Bandwidth</span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {formatCost(fileBandwidthCost)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
                  <div className="mb-2 text-muted-foreground">Formula:</div>
                  <div className="text-foreground">
                    ${pricing.FILE_BANDWIDTH_PER_GB.toFixed(2)} ×{" "}
                    {formatNumber(fileBandwidthGB, 4)} GB ={" "}
                    <span className="font-semibold text-yellow-600">
                      {formatCost(fileBandwidthCost)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      File I/O (GB):
                    </span>
                    <span className="font-medium">
                      {formatNumber(fileBandwidthGB, 4)} GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate:</span>
                    <span className="font-medium">
                      ${pricing.FILE_BANDWIDTH_PER_GB.toFixed(2)} per GB
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-muted bg-muted/30 p-2 text-xs text-muted-foreground">
                  No file storage operations detected in this time period.
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
