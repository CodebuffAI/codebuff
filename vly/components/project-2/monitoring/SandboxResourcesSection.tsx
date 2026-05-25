"use client";

import React from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type {
  SandboxMetricsHistory,
  TimeRange,
} from "@/lib/monitoring/monitoring-types";
import type { SandboxStats } from "@/codebase-utils/codebase/Codebase";
import type { Customer } from "autumn-js";
import MonitoringSectionAccordion from "./shared/MonitoringSectionAccordion";
import SandboxResourceStats from "./SandboxResourceStats";
import WorkspaceUpgradePanel from "./WorkspaceUpgradePanel";
import SandboxMetricsCharts from "./SandboxMetricsCharts";
import { getSizeDisplayName } from "@/lib/sandbox-specs";
import { Box } from "lucide-react";

interface SandboxResourcesSectionProps {
  sandboxStats: SandboxStats | null | undefined;
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
  selectedSnapshotId: string;
  setSelectedSnapshotId: (id: string) => void;
  isMigrating: boolean;
  setIsMigrating: (migrating: boolean) => void;
  handleMigrateWorkspace: () => Promise<void>;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  metricsHistory: SandboxMetricsHistory | null | undefined;
  metricsLoading: boolean;
  metricsError: string | null;
  setPaywallOpen: (open: boolean) => void;
  setPaywallFeatureId: (featureId: string) => void;
  customer: Customer | null | undefined;
  allProjects:
    | FunctionReturnType<typeof api.project.getUserProjects>
    | undefined;
}

export default function SandboxResourcesSection({
  sandboxStats,
  project,
  selectedSnapshotId,
  setSelectedSnapshotId,
  isMigrating,
  handleMigrateWorkspace,
  metricsHistory,
  metricsLoading,
  metricsError,
  customer,
  allProjects,
}: SandboxResourcesSectionProps) {
  if (!sandboxStats) return null;

  return (
    <MonitoringSectionAccordion
      value="sandbox"
      icon={<Box className="h-4 w-4 text-purple-600" />}
      title="Workspace Resources"
      badge={getSizeDisplayName(project?.sandbox_size)}
    >
      {/* Responsive Grid: Left (Resources) + Right (Upgrade Workspace) */}
      <div className="space-y-5 xl:grid xl:grid-cols-[1fr,1fr] xl:items-start xl:gap-5 xl:space-y-0">
        {/* Left Column: Resource Stats */}
        <div className="space-y-5">
          {/* Resource Stats */}
          <SandboxResourceStats sandboxStats={sandboxStats} />
        </div>

        {/* Right Column: Workspace Upgrade Panel */}
        <WorkspaceUpgradePanel
          project={project}
          sandboxStats={sandboxStats}
          selectedSnapshotId={selectedSnapshotId}
          setSelectedSnapshotId={setSelectedSnapshotId}
          isMigrating={isMigrating}
          handleMigrateWorkspace={handleMigrateWorkspace}
          customer={customer}
          allProjects={allProjects}
        />
      </div>

      {/* Resource Usage Charts */}
      <SandboxMetricsCharts
        metricsHistory={metricsHistory}
        metricsLoading={metricsLoading}
        metricsError={metricsError}
      />
    </MonitoringSectionAccordion>
  );
}
