"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import {
  DollarSign,
  Activity,
  Clock,
  Database,
  HardDrive,
  Bot,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/vly/lib/utils";
import { CONVEX_PRICING } from "@/convex/lib/convex_pricing";
import type { FunctionCostItem } from "@/vly/lib/monitoring/monitoring-types";
import { Id } from "@/convex/_generated/dataModel";

interface TopCostItemsAccordionProps {
  title: string;
  items: FunctionCostItem[];
  onDebugClick?: (item: FunctionCostItem) => void;
  onDebugAllClick?: () => void;
  emptyMessage?: string;
  defaultOpen?: boolean;
  className?: string;
  showPauseButtons?: boolean;
  showDeploymentLinks?: boolean;
  deploymentPauseStatus?: Map<
    string,
    { paused: boolean; projectId: Id<"project"> | null }
  >;
  onPauseClick?: (
    deploymentName: string,
    projectId: Id<"project"> | null,
    isPaused: boolean,
  ) => void;
}

const variantBadgeStyles =
  "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";

const variantProgressBgStyles = "bg-yellow-500/20";

export function TopCostItemsAccordion({
  title,
  items,
  onDebugClick,
  onDebugAllClick,
  emptyMessage = "No cost data available",
  defaultOpen = false,
  className,
  showPauseButtons = false,
  showDeploymentLinks = false,
  deploymentPauseStatus,
  onPauseClick,
}: TopCostItemsAccordionProps) {
  const [outerAccordionValue, setOuterAccordionValue] = useState<string>(
    defaultOpen ? "outer-item" : "",
  );

  // Track which individual items have their cost breakdowns expanded
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const pricing = CONVEX_PRICING.PROFESSIONAL.OVERAGE;

  // Calculate max cost for progress bars
  const maxCost =
    items.length > 0 ? Math.max(...items.map((i) => i.estimatedCost)) : 1;

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  // Calculate individual cost components for a function
  const calculateItemCosts = (item: FunctionCostItem) => {
    const functionCallsInMillions = item.executionCount / 1_000_000;
    const functionCallsCost =
      functionCallsInMillions * pricing.FUNCTION_CALLS_PER_MILLION;

    // Estimate compute cost (using average 128MB memory assumption)
    const estimatedMemoryMb = 128;
    const computeGBHours =
      (estimatedMemoryMb / 1024) *
      (item.totalExecutionTimeMs / (1000 * 60 * 60));
    const computeCost = computeGBHours * pricing.COMPUTE_PER_GB_HOUR;

    // Database bandwidth cost
    const dbBandwidthGB = item.totalBandwidthBytes / 1024 ** 3;
    const dbBandwidthCost = dbBandwidthGB * pricing.DATABASE_STORAGE_PER_GB;

    // File bandwidth (assumed to be 0 for now)
    const fileBandwidthGB = 0;
    const fileBandwidthCost = 0;

    return {
      functionCalls: {
        inMillions: functionCallsInMillions,
        cost: functionCallsCost,
      },
      compute: {
        gbHours: computeGBHours,
        memoryMb: estimatedMemoryMb,
        cost: computeCost,
      },
      dbBandwidth: {
        gb: dbBandwidthGB,
        cost: dbBandwidthCost,
      },
      fileBandwidth: {
        gb: fileBandwidthGB,
        cost: fileBandwidthCost,
      },
    };
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={outerAccordionValue}
      onValueChange={setOuterAccordionValue}
      className={className}
    >
      <AccordionItem value="outer-item" className="rounded-lg border px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex w-full items-center justify-between gap-2 pr-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="font-semibold">{title}</span>
              <Badge variant="outline" className={cn(variantBadgeStyles)}>
                {items.length}
              </Badge>
            </div>
            {onDebugAllClick && items.length > 0 && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onDebugAllClick();
                }}
                className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                title="Copy debug info for all items to clipboard"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onDebugAllClick();
                  }
                }}
              >
                <Bot className="h-3 w-3" />
                <span className="text-xs">Debug All</span>
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {items.map((item, idx) => {
                const percentage = (item.estimatedCost / maxCost) * 100;
                const costs = calculateItemCosts(item);
                const itemId = `item-${idx}`;
                const isExpanded = expandedItems.includes(itemId);

                return (
                  <div
                    key={itemId}
                    className="space-y-1.5 rounded-lg border bg-card p-2"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between gap-2">
                      {showDeploymentLinks ? (
                        <a
                          href={`https://web/dashboard.convex.dev/d/${item.functionPath}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.functionPath}
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {item.functionPath}
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            variantBadgeStyles,
                            "px-1.5 py-0 text-[10px]",
                          )}
                        >
                          {formatCost(item.estimatedCost)}
                        </Badge>
                        {showPauseButtons &&
                          deploymentPauseStatus &&
                          onPauseClick &&
                          (() => {
                            const status = deploymentPauseStatus.get(
                              item.functionPath,
                            );
                            if (status) {
                              const isPaused = status.paused;
                              const hasProjectId = status.projectId !== null;
                              return (
                                <>
                                  <Badge
                                    variant={
                                      isPaused ? "destructive" : "default"
                                    }
                                    className={cn(
                                      "px-1.5 py-0 text-[10px]",
                                      isPaused
                                        ? ""
                                        : "bg-green-600 hover:bg-green-700",
                                    )}
                                  >
                                    {isPaused ? "Paused" : "Active"}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (hasProjectId) {
                                        onPauseClick(
                                          item.functionPath,
                                          status.projectId,
                                          isPaused,
                                        );
                                      }
                                    }}
                                    disabled={!hasProjectId}
                                    title={
                                      !hasProjectId
                                        ? "Project not found - cannot pause"
                                        : isPaused
                                          ? "Resume project"
                                          : "Pause project"
                                    }
                                  >
                                    {isPaused ? (
                                      <Play className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Pause className="h-3 w-3 text-red-600" />
                                    )}
                                  </Button>
                                </>
                              );
                            }
                            return null;
                          })()}
                        {onDebugClick && !showPauseButtons && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onDebugClick(item);
                            }}
                            className="inline-flex h-6 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-1.5 text-xs shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                            title="Copy debug info to clipboard"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                onDebugClick(item);
                              }
                            }}
                          >
                            <Bot className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div
                      className={cn(
                        "h-1 w-full overflow-hidden rounded-full",
                        variantProgressBgStyles,
                      )}
                    >
                      <div
                        className="h-full bg-yellow-500 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    {/* Quick Stats - Only show when not expanded */}
                    {!isExpanded && (
                      <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                        <span>
                          {item.executionCount.toLocaleString()} calls
                        </span>
                        <span>{formatMs(item.totalExecutionTimeMs)}</span>
                        <span>{formatBytes(item.totalBandwidthBytes)}</span>
                      </div>
                    )}

                    {/* Nested Accordion for Cost Breakdown */}
                    <Accordion
                      type="single"
                      collapsible
                      value={isExpanded ? itemId : ""}
                      onValueChange={(value) => {
                        setExpandedItems((prev) =>
                          value
                            ? [...prev.filter((id) => id !== itemId), itemId]
                            : prev.filter((id) => id !== itemId),
                        );
                      }}
                    >
                      <AccordionItem value={itemId} className="border-none">
                        <AccordionTrigger className="py-1 text-[10px] font-medium hover:no-underline">
                          <span className="text-muted-foreground">
                            {isExpanded ? "Hide" : "View"} Cost Breakdown
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-2">
                          <div className="space-y-2 pl-1">
                            {/* Function Calls Cost */}
                            <div className="rounded-md border bg-muted/30 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium">
                                    Function Calls
                                  </span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {formatCost(costs.functionCalls.cost)}
                                </Badge>
                              </div>
                              <div className="rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                                ${pricing.FUNCTION_CALLS_PER_MILLION.toFixed(2)}{" "}
                                × ({item.executionCount.toLocaleString()} ÷ 1M)
                                ={" "}
                                <span className="font-semibold text-yellow-600">
                                  {formatCost(costs.functionCalls.cost)}
                                </span>
                              </div>
                            </div>

                            {/* Compute Cost */}
                            <div className="rounded-md border bg-muted/30 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium">
                                    Compute
                                  </span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {formatCost(costs.compute.cost)}
                                </Badge>
                              </div>
                              <div className="space-y-1">
                                <div className="rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                                  ${pricing.COMPUTE_PER_GB_HOUR.toFixed(2)} ×{" "}
                                  {formatNumber(costs.compute.gbHours, 4)}{" "}
                                  GB-hrs ={" "}
                                  <span className="font-semibold text-yellow-600">
                                    {formatCost(costs.compute.cost)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Est. {costs.compute.memoryMb}MB memory
                                </div>
                              </div>
                            </div>

                            {/* Database Bandwidth Cost */}
                            <div className="rounded-md border bg-muted/30 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Database className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium">
                                    Database Bandwidth
                                  </span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {formatCost(costs.dbBandwidth.cost)}
                                </Badge>
                              </div>
                              <div className="rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                                ${pricing.DATABASE_STORAGE_PER_GB.toFixed(2)} ×{" "}
                                {formatNumber(costs.dbBandwidth.gb, 4)} GB ={" "}
                                <span className="font-semibold text-yellow-600">
                                  {formatCost(costs.dbBandwidth.cost)}
                                </span>
                              </div>
                            </div>

                            {/* File Bandwidth Cost */}
                            <div className="rounded-md border bg-muted/30 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <HardDrive className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium">
                                    File Bandwidth
                                  </span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {formatCost(costs.fileBandwidth.cost)}
                                </Badge>
                              </div>
                              <div className="rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                                ${pricing.FILE_BANDWIDTH_PER_GB.toFixed(2)} ×{" "}
                                {formatNumber(costs.fileBandwidth.gb, 4)} GB ={" "}
                                <span className="font-semibold text-yellow-600">
                                  {formatCost(costs.fileBandwidth.cost)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
