"use client";

import React, { useState } from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCustomer } from "autumn-js/react";
import PaywallDialog from "@/components/autumn/paywall-dialog";
import { useMonitoringMetrics } from "@/hooks/useMonitoringMetrics";
import { useTimeRange } from "@/hooks/useTimeRange";
import { useWorkspaceMigration } from "@/hooks/useWorkspaceMigration";

import MonitoringHeader from "./monitoring/MonitoringHeader";
import MonitoringLoadingState from "./monitoring/MonitoringLoadingState";
import ConvexUsageSection from "./monitoring/ConvexUsageSection";
import SandboxResourcesSection from "./monitoring/SandboxResourcesSection";

interface MonitoringProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
}

export default function Monitoring({ project }: MonitoringProps) {
  // Stats monitoring is always enabled
  const statsMonitoringEnabled = true;

  const [deploymentType, setDeploymentType] = useState<"dev" | "prod" | "all">(
    "all",
  );
  const [showAllTimeSeries, setShowAllTimeSeries] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeatureId, setPaywallFeatureId] = useState<string>("");

  const { customer } = useCustomer();

  // Fetch all user projects to calculate workspace quota usage
  const allProjects = useQuery(api.project.getUserProjects);

  // Custom hooks for data fetching and business logic
  const timeRangeHook = useTimeRange("billing_cycle", { customer });
  const {
    metrics,
    sandboxStats,
    metricsHistory,
    loading = { metrics: false, sandboxStats: false, metricsHistory: false },
    errors = { metrics: null, sandboxStats: null, metricsHistory: null },
  } = useMonitoringMetrics({
    projectId: project?._id as Id<"project"> | undefined,
    deploymentType,
    convexTimeRange: timeRangeHook.timeRangeValues,
    sandboxTimeRange: timeRangeHook.timeRangeValues,
    statsMonitoringEnabled,
  });

  const migration = useWorkspaceMigration({
    projectId: project?._id as Id<"project"> | undefined,
    currentSandboxSize: project?.sandbox_size,
  });

  return (
    <div className="space-y-3">
      <MonitoringHeader
        deploymentType={deploymentType}
        setDeploymentType={setDeploymentType}
        metrics={metrics}
        loading={loading.metrics}
        error={errors.metrics}
        timeRange={timeRangeHook.timeRange}
        setTimeRange={timeRangeHook.setTimeRange}
        customStartDate={timeRangeHook.customStartDate}
        setCustomStartDate={timeRangeHook.setCustomStartDate}
        customEndDate={timeRangeHook.customEndDate}
        setCustomEndDate={timeRangeHook.setCustomEndDate}
      />

      <div className="px-4 pb-4">
        <MonitoringLoadingState
          loading={loading.metrics}
          error={errors.metrics}
        />

        {!loading.metrics && !errors.metrics && metrics && (
          <div
            className={`grid gap-3 ${sandboxStats ? "xl:grid-cols-2" : "xl:grid-cols-1"}`}
          >
            {sandboxStats && (
              <SandboxResourcesSection
                sandboxStats={sandboxStats}
                project={project}
                selectedSnapshotId={migration.selectedSnapshotId}
                setSelectedSnapshotId={migration.setSelectedSnapshotId}
                isMigrating={migration.isMigrating}
                setIsMigrating={migration.setIsMigrating}
                handleMigrateWorkspace={migration.migrate}
                timeRange={timeRangeHook.timeRange}
                setTimeRange={timeRangeHook.setTimeRange}
                customStartDate={timeRangeHook.customStartDate}
                setCustomStartDate={timeRangeHook.setCustomStartDate}
                customEndDate={timeRangeHook.customEndDate}
                setCustomEndDate={timeRangeHook.setCustomEndDate}
                metricsHistory={metricsHistory}
                metricsLoading={loading.metricsHistory}
                metricsError={errors.metricsHistory}
                setPaywallOpen={setPaywallOpen}
                setPaywallFeatureId={setPaywallFeatureId}
                customer={customer}
                allProjects={allProjects}
              />
            )}

            <ConvexUsageSection
              metrics={metrics}
              showAllTimeSeries={showAllTimeSeries}
              setShowAllTimeSeries={setShowAllTimeSeries}
              timeRange={timeRangeHook.timeRange}
              setTimeRange={timeRangeHook.setTimeRange}
              customStartDate={timeRangeHook.customStartDate}
              setCustomStartDate={timeRangeHook.setCustomStartDate}
              customEndDate={timeRangeHook.customEndDate}
              setCustomEndDate={timeRangeHook.setCustomEndDate}
              timeRangeValues={timeRangeHook.timeRangeValues}
            />
          </div>
        )}
      </div>
      <PaywallDialog
        open={paywallOpen}
        setOpen={setPaywallOpen}
        featureId={paywallFeatureId}
      />
    </div>
  );
}
