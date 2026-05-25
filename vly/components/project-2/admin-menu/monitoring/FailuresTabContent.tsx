"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, AlertCircle, RefreshCw, XCircle, Medal } from "lucide-react";
import { LoadingState } from "../shared";
import { TIME_RANGES } from "@/lib/monitoring/monitoring-constants";

interface IncidentDashboard {
  timeRange: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  summary: {
    totalErrors: number;
    affectedDeploymentsCount: number;
  };
  topFailingFunctions: Array<{
    functionPath: string;
    failureCount: number;
  }>;
  affectedDeployments: Array<{
    deploymentName: string;
    errorCount: number;
  }>;
}

interface FailuresTabContentProps {
  dataset: string;
  timeRange: string;
  onFilterByFunction: (functionPath: string, errorsOnly?: boolean) => void;
  refetchTrigger?: number;
}

export function FailuresTabContent({
  dataset,
  timeRange,
  onFilterByFunction,
  refetchTrigger,
}: FailuresTabContentProps) {
  const [loadingFunctionPath, setLoadingFunctionPath] = useState<string | null>(
    null,
  );
  const [dashboardData, setDashboardData] = useState<IncidentDashboard | null>(
    null,
  );
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const getIncidentDashboard = useAction(api.monitoring.getIncidentDashboard);

  // Fetch incident dashboard
  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const timeRangeConfig = TIME_RANGES.find((tr) => tr.value === timeRange);
      const timeRangeMs = timeRangeConfig?.ms || 24 * 60 * 60 * 1000;

      const result = await getIncidentDashboard({
        dataset,
        timeRangeMs,
      });

      setDashboardData(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch dashboard data";
      setDashboardError(errorMessage);
      console.error("Error fetching dashboard:", err);
    } finally {
      setDashboardLoading(false);
    }
  }, [timeRange, dataset, getIncidentDashboard]);

  // Auto-fetch on mount and when dataset/timeRange change
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Refetch when parent triggers it
  useEffect(() => {
    if (refetchTrigger && refetchTrigger > 0) {
      fetchDashboard();
    }
  }, [refetchTrigger, fetchDashboard]);

  const handleFunctionClick = (functionPath: string) => {
    setLoadingFunctionPath(functionPath);
    onFilterByFunction(functionPath, true);
    // Clear loading state after a short delay
    setTimeout(() => setLoadingFunctionPath(null), 1000);
  };

  return (
    <div className="min-w-0 space-y-4">
      {/* TOP FAILING FUNCTIONS ACCORDION */}
      {!dashboardLoading && !dashboardError && dashboardData && (
        <Accordion type="single" collapsible className="w-full min-w-0">
          <AccordionItem
            value="failing-functions"
            className={`min-w-0 rounded-lg border shadow-sm ${
              dashboardData.topFailingFunctions.length > 0
                ? "border-red-200 bg-white"
                : "border-green-200 bg-white"
            }`}
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between pr-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      dashboardData.topFailingFunctions.length > 0
                        ? "bg-red-100"
                        : "bg-green-100"
                    }`}
                  >
                    {dashboardData.topFailingFunctions.length > 0 ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Medal className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-zinc-900">
                    {dashboardData.topFailingFunctions.length > 0
                      ? "Top Failing Functions"
                      : "All Functions Healthy"}
                  </span>
                </div>
                {dashboardData.topFailingFunctions.length > 0 && (
                  <Badge variant="destructive" className="mr-2">
                    {dashboardData.topFailingFunctions.length}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {dashboardData.topFailingFunctions.length > 0 ? (
                <div className="min-w-0 space-y-2">
                  {(() => {
                    // Calculate max failure count for relative progress bars
                    const maxFailures = Math.max(
                      ...dashboardData.topFailingFunctions.map(
                        (f) => f.failureCount,
                      ),
                    );

                    return dashboardData.topFailingFunctions.map(
                      (func, idx) => {
                        const percentage =
                          maxFailures > 0
                            ? (func.failureCount / maxFailures) * 100
                            : 0;

                        const isLoadingThis =
                          loadingFunctionPath === func.functionPath;

                        return (
                          <button
                            key={idx}
                            onClick={() =>
                              handleFunctionClick(func.functionPath)
                            }
                            disabled={isLoadingThis}
                            className="group relative w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-left transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {/* Progress bar background */}
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-red-100 to-red-50 opacity-60 transition-all group-hover:opacity-80"
                              style={{ width: `${percentage}%` }}
                            />

                            {/* Content */}
                            <div className="relative flex min-w-0 items-center justify-between px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {isLoadingThis && (
                                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-red-600" />
                                )}
                                <span className="truncate font-mono text-xs font-medium text-zinc-700">
                                  {func.functionPath}
                                </span>
                              </div>
                              <Badge
                                variant="destructive"
                                className="ml-2 shrink-0 text-xs"
                              >
                                {func.failureCount}
                              </Badge>
                            </div>
                          </button>
                        );
                      },
                    );
                  })()}
                </div>
              ) : (
                <div className="py-4 text-center text-sm font-medium text-green-700">
                  No failing functions in this timeframe 🏅
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Dashboard Loading */}
      {dashboardLoading && (
        <div className="min-w-0 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
          <LoadingState message="Loading failing functions..." />
        </div>
      )}

      {/* Dashboard Error */}
      {dashboardError && (
        <div className="min-w-0 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-red-900">
                Error Loading Failing Functions
              </h4>
              <p className="mt-1 break-words text-sm text-red-700">
                {dashboardError}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchDashboard()}
                className="mt-3 gap-2"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
