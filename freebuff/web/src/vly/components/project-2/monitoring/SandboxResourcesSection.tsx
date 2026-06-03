"use client";

import React from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { SandboxMetricsHistory } from "@/vly/lib/monitoring/monitoring-types";
import type { SandboxStats } from "@/vly/codebase-utils/codebase/Codebase";
import type { Customer } from "autumn-js";
import MonitoringSectionAccordion from "./shared/MonitoringSectionAccordion";
import SandboxResourceStats from "./SandboxResourceStats";
import WorkspaceUpgradePanel from "./WorkspaceUpgradePanel";
import SandboxMetricsCharts from "./SandboxMetricsCharts";
import { getSizeDisplayName } from "@/vly/lib/sandbox-specs";
import { Box } from "lucide-react";

interface SandboxResourcesSectionProps {
  sandboxStats: SandboxStats | null | undefined;
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
  selectedSnapshotId: string;
  setSelectedSnapshotId: (id: string) => void;
  isMigrating: boolean;
  handleMigrateWorkspace: () => Promise<void>;
  metricsHistory: SandboxMetricsHistory | null | undefined;
  metricsLoading: boolean;
  metricsError: string | null;
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
      <div className="space-y-5">
        <SandboxResourceStats sandboxStats={sandboxStats} />

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
