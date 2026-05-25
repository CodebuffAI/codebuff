import React, { useEffect, useRef, useState } from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  Check,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { DAYTONA_SNAPSHOTS } from "@/config/daytona-snapshots";
import { getSandboxFeatureId } from "@/lib/billing/workspace-quota-utils";
import type { SandboxSize } from "@/lib/sandbox-specs";
import type { SandboxStats } from "@/codebase-utils/codebase/Codebase";
import type { Customer } from "autumn-js";
import { getTierDirection } from "@/lib/monitoring/monitoring-utils";
import { calculateCurrentUsage } from "@/lib/monitoring/chart-data-processors";
import { TIER_COLORS } from "@/lib/monitoring/monitoring-constants";
import { WorkspaceUpgradeConfirmationDialog } from "./WorkspaceUpgradeConfirmationDialog";
import { WorkspaceDowngradeConfirmationDialog } from "./WorkspaceDowngradeConfirmationDialog";

interface WorkspaceUpgradePanelProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
  sandboxStats: SandboxStats;
  selectedSnapshotId: string;
  setSelectedSnapshotId: (id: string) => void;
  isMigrating: boolean;
  handleMigrateWorkspace: () => Promise<void>;
  customer: Customer | null | undefined;
  allProjects:
    | FunctionReturnType<typeof api.project.getUserProjects>
    | undefined;
}

export default function WorkspaceUpgradePanel({
  project,
  sandboxStats,
  selectedSnapshotId,
  setSelectedSnapshotId,
  isMigrating,
  handleMigrateWorkspace,
  customer,
  allProjects,
}: WorkspaceUpgradePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
  const [pendingSnapshot, setPendingSnapshot] = useState<
    (typeof DAYTONA_SNAPSHOTS)[0] | null
  >(null);

  // Customer is already passed as prop, no need for separate hook

  // Click-outside detection to deselect tier
  useEffect(() => {
    if (!project?.sandbox_id?.startsWith("daytona:")) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      // Don't clear selection if a confirmation dialog is open
      if (showUpgradeDialog || showDowngradeDialog) {
        return;
      }

      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        // Only clear if a non-current tier is selected
        const selectedSnapshot = DAYTONA_SNAPSHOTS.find(
          (s) => s.id === selectedSnapshotId,
        );
        if (
          selectedSnapshot &&
          project &&
          selectedSnapshot.tier !== project.sandbox_size
        ) {
          setSelectedSnapshotId("");
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [
    selectedSnapshotId,
    project,
    setSelectedSnapshotId,
    showUpgradeDialog,
    showDowngradeDialog,
  ]);

  if (!project?.sandbox_id?.startsWith("daytona:")) {
    return null;
  }

  const currentUsage = calculateCurrentUsage(sandboxStats);

  // Handler for migration button click - shows appropriate confirmation dialog
  const handleMigrationClick = (snapshot: (typeof DAYTONA_SNAPSHOTS)[0]) => {
    const currentSize = project.sandbox_size || "small";
    const currentSnapshot = DAYTONA_SNAPSHOTS.find(
      (s) => s.tier === currentSize,
    );
    if (!currentSnapshot) return;

    const direction = getTierDirection(currentSnapshot.tier, snapshot.tier);
    setPendingSnapshot(snapshot);

    if (direction === "upgrade") {
      setShowUpgradeDialog(true);
    } else {
      setShowDowngradeDialog(true);
    }
  };

  // Handler for confirmation - actually performs the migration
  const handleConfirmMigration = async () => {
    await handleMigrateWorkspace();
  };

  // Count projects by sandbox size (same logic as billing page)
  const projectsBySizeMap = new Map<SandboxSize, number>();
  allProjects?.forEach((proj) => {
    if (proj.sandbox_size) {
      const size = proj.sandbox_size as SandboxSize;
      projectsBySizeMap.set(size, (projectsBySizeMap.get(size) || 0) + 1);
    }
  });

  return (
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-2xl px-6 pb-6"
    >
      {/* Glassmorphic background layer */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.1) 100%)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      />
      {/* Subtle border highlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow:
            "inset 0px 1px 0px rgba(255,255,255,0.8), 0px 4px 24px rgba(200,200,200,0.15)",
          transform: "translateZ(0)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 space-y-3">
        <div>
          <h3 className="font-['PP_Cirka'] text-lg font-normal text-zinc-800">
            Upgrade Workspace
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Upgrade or downgrade your workspace resources
          </p>
        </div>

        {/* Template Tier Cards */}
        <div className="grid grid-cols-1 gap-2.5">
          {DAYTONA_SNAPSHOTS.map((snapshot) => {
            const isCurrent =
              (project.sandbox_size || "small") === snapshot.tier;
            const isSelected = selectedSnapshotId === snapshot.id;

            // Parse snapshot specs
            const snapshotRAM = parseFloat(snapshot.specs.ram);
            const snapshotDisk = parseFloat(snapshot.specs.disk);

            // Calculate usage percentages for this tier
            const ramPercent = currentUsage
              ? (currentUsage.ram / snapshotRAM) * 100
              : 0;
            const diskPercent = currentUsage
              ? (currentUsage.disk / snapshotDisk) * 100
              : 0;

            // Tier-specific styling
            const colors =
              TIER_COLORS[snapshot.tier as keyof typeof TIER_COLORS];

            // Get quota information for this size
            const sizeFeatureId = getSandboxFeatureId(
              snapshot.tier as SandboxSize,
            );
            const sizeFeature = customer?.features?.[sizeFeatureId];

            // Check if user has access to this sandbox size
            // User has access if the feature exists in their customer object
            const isAllowed = !!customer?.features?.[sizeFeatureId];

            // Use actual project count from database instead of sizeFeature?.usage
            const quotaCurrent =
              projectsBySizeMap.get(snapshot.tier as SandboxSize) ?? 0;

            // Determine quota limit (Small is ALWAYS unlimited)
            let quotaLimit: number | "inf" = 0;
            if (snapshot.tier === "small") {
              // Small workspaces are ALWAYS unlimited for all plans
              quotaLimit = "inf";
            } else if (sizeFeature) {
              // Check unlimited field
              if (sizeFeature.unlimited === true) {
                quotaLimit = "inf";
              } else {
                quotaLimit =
                  (sizeFeature.included_usage as number | undefined) ?? 0;
              }
            }

            const isUnlimited = quotaLimit === "inf";
            const hasQuota =
              isUnlimited || quotaCurrent < (quotaLimit as number);

            // Calculate migration details for this tier
            const currentSnapshot = DAYTONA_SNAPSHOTS.find(
              (s) => s.tier === project.sandbox_size,
            );
            const direction = currentSnapshot
              ? getTierDirection(currentSnapshot.tier, snapshot.tier)
              : "upgrade";
            const isMigrationUpgrade = direction === "upgrade";

            return (
              <div key={snapshot.id} className="space-y-2">
                <button
                  onClick={() =>
                    !isCurrent &&
                    !isMigrating &&
                    setSelectedSnapshotId(isSelected ? "" : snapshot.id)
                  }
                  disabled={isCurrent || isMigrating}
                  className={`relative w-full overflow-hidden rounded-lg border-2 p-2.5 text-left transition-all duration-200 ${
                    isCurrent
                      ? `${colors.selectedBorder} ${colors.selectedBg} cursor-default shadow-sm`
                      : isSelected
                        ? `${colors.selectedBorder} ${colors.bg} shadow-lg ring-2 ring-offset-2 ${colors.selectedBorder.replace("border-", "ring-")} scale-[1.02]`
                        : `${colors.border} hover:${colors.bg} hover:scale-[1.01] hover:shadow-sm`
                  } ${isMigrating ? "opacity-50" : ""}`}
                  style={{
                    background: isCurrent
                      ? undefined
                      : isSelected
                        ? undefined
                        : "rgba(255, 255, 255, 0.7)",
                    backdropFilter:
                      !isCurrent && !isSelected ? "blur(8px)" : undefined,
                    WebkitBackdropFilter:
                      !isCurrent && !isSelected ? "blur(8px)" : undefined,
                  }}
                >
                  {/* Header */}
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-zinc-900">
                        {snapshot.name}
                      </h4>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <Check className="h-3 w-3" />
                          Current
                        </span>
                      )}
                      {/* Plan Access Badge - Show when user doesn't have access */}
                      {!isCurrent && !isAllowed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          <Lock className="h-3 w-3" />
                          {snapshot.tier === "medium"
                            ? "Requires Hobby"
                            : "Requires Pro"}
                        </span>
                      )}
                      {/* Quota Badge - Only show if user has plan access */}
                      {(isCurrent || isAllowed) && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isUnlimited
                              ? "bg-green-100 text-green-700"
                              : hasQuota
                                ? "bg-blue-100 text-blue-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isUnlimited
                            ? "∞ Unlimited"
                            : `${quotaCurrent}/${quotaLimit as number} used`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resource Specs and Usage */}
                  <div className="space-y-2">
                    {/* Specs Line */}
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" />
                        {snapshot.specs.cpu}
                      </span>
                      <span className="flex items-center gap-1">
                        <MemoryStick className="h-3 w-3" />
                        {snapshot.specs.ram}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {snapshot.specs.disk}
                      </span>
                    </div>

                    {/* Current Size: Show Current Usage */}
                    {isCurrent && currentUsage && (
                      <div className="rounded-lg bg-green-50 p-1.5">
                        <div className="mb-1 text-xs font-medium text-green-800">
                          Your usage:
                        </div>
                        <div className="flex items-center gap-3 text-xs text-green-700">
                          <span>RAM: {ramPercent.toFixed(0)}%</span>
                          <span>•</span>
                          <span>Disk: {diskPercent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}

                    {/* Non-Current Sizes: Show Projections */}
                    {!isCurrent && currentUsage && (
                      <div className="rounded-lg bg-zinc-50 p-1.5">
                        <div className="mb-1 text-xs font-medium text-zinc-700">
                          Projected usage:
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-600">
                          <span>RAM: {ramPercent.toFixed(0)}%</span>
                          <span>•</span>
                          <span>Disk: {diskPercent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </button>

                {/* Accordion Panel - Shows under selected tier */}
                {isSelected && !isCurrent && (
                  <div className="overflow-hidden duration-300 animate-in fade-in slide-in-from-top-2">
                    {!isAllowed || !hasQuota ? (
                      // No Access or No Quota - Show Upgrade CTA
                      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 backdrop-blur-sm duration-200 animate-in fade-in slide-in-from-top-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <ArrowUp className="h-4 w-4 text-amber-700" />
                            <span className="text-sm font-semibold text-amber-900">
                              Upgrade Required
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-amber-700">
                            {!isAllowed ? (
                              <>
                                You need to upgrade your plan to access{" "}
                                <span className="font-semibold">
                                  {snapshot.name}
                                </span>{" "}
                                tier sandboxes. Visit the billing page to
                                upgrade your plan.
                              </>
                            ) : (
                              <>
                                You've reached your{" "}
                                <span className="font-semibold">
                                  {snapshot.name}
                                </span>{" "}
                                sandbox quota ({quotaLimit}). Upgrade your plan
                                for more sandboxes.
                              </>
                            )}
                          </p>
                        </div>
                        <Button
                          onClick={() => router.push("/dashboard/billing")}
                          className="ml-4 shrink-0 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
                        >
                          <ArrowUp className="mr-2 h-4 w-4" />
                          Upgrade Plan
                        </Button>
                      </div>
                    ) : (
                      // Has Quota - Show Migration Panel
                      (() => {
                        // Calculate resource differences
                        const cpuDiff =
                          parseFloat(snapshot.specs.cpu) -
                          (currentSnapshot
                            ? parseFloat(currentSnapshot.specs.cpu)
                            : 1);
                        const ramDiff =
                          parseFloat(snapshot.specs.ram) -
                          (currentSnapshot
                            ? parseFloat(currentSnapshot.specs.ram)
                            : 3);
                        const diskDiff =
                          parseFloat(snapshot.specs.disk) -
                          (currentSnapshot
                            ? parseFloat(currentSnapshot.specs.disk)
                            : 4);

                        return (
                          <div
                            className={`flex items-center justify-between rounded-xl border p-4 backdrop-blur-sm duration-200 animate-in fade-in slide-in-from-top-1 ${
                              isMigrationUpgrade
                                ? "border-purple-200/50 bg-gradient-to-r from-purple-50/80 to-purple-100/60"
                                : "border-orange-200/50 bg-gradient-to-r from-orange-50/80 to-orange-100/60"
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {isMigrationUpgrade ? (
                                  <ArrowUp
                                    className={`h-4 w-4 ${isMigrationUpgrade ? "text-purple-700" : "text-orange-700"}`}
                                  />
                                ) : (
                                  <RefreshCw
                                    className={`h-4 w-4 ${isMigrationUpgrade ? "text-purple-700" : "text-orange-700"}`}
                                  />
                                )}
                                <span
                                  className={`text-sm font-semibold ${isMigrationUpgrade ? "text-purple-900" : "text-orange-900"}`}
                                >
                                  {isMigrationUpgrade
                                    ? `Upgrade to ${snapshot.name}`
                                    : `Downgrade to ${snapshot.name}`}
                                </span>
                              </div>
                              <p
                                className={`mt-1 text-xs ${isMigrationUpgrade ? "text-purple-700" : "text-orange-700"}`}
                              >
                                {isMigrationUpgrade ? (
                                  <>
                                    Get{" "}
                                    {cpuDiff > 0 && (
                                      <span className="font-semibold">
                                        +{cpuDiff} CPU
                                      </span>
                                    )}
                                    {cpuDiff > 0 && ramDiff > 0 && ", "}
                                    {ramDiff > 0 && (
                                      <span className="font-semibold">
                                        +{ramDiff}GB RAM
                                      </span>
                                    )}
                                    {(cpuDiff > 0 || ramDiff > 0) &&
                                      diskDiff > 0 &&
                                      ", "}
                                    {diskDiff > 0 && (
                                      <span className="font-semibold">
                                        +{diskDiff}GB Disk
                                      </span>
                                    )}
                                    . Your workspace will be migrated and all
                                    files transferred.
                                  </>
                                ) : (
                                  <>
                                    This will reduce resources to{" "}
                                    <span className="font-semibold">
                                      {snapshot.specs.cpu} CPU,{" "}
                                      {snapshot.specs.ram} RAM,{" "}
                                      {snapshot.specs.disk} Disk
                                    </span>
                                    . Make sure your current usage fits within
                                    these limits.
                                  </>
                                )}
                              </p>
                            </div>
                            <Button
                              onClick={() => handleMigrationClick(snapshot)}
                              disabled={isMigrating}
                              className={`ml-4 shrink-0 text-white ${
                                isMigrationUpgrade
                                  ? "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                                  : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                              }`}
                            >
                              {isMigrating ? (
                                <>
                                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                  Migrating...
                                </>
                              ) : (
                                <>
                                  {isMigrationUpgrade ? (
                                    <ArrowUp className="mr-2 h-4 w-4" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  {isMigrationUpgrade
                                    ? "Upgrade Now"
                                    : "Downgrade"}
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      {pendingSnapshot && project && (
        <>
          <WorkspaceUpgradeConfirmationDialog
            open={showUpgradeDialog}
            onOpenChange={setShowUpgradeDialog}
            onConfirm={handleConfirmMigration}
            currentSize={(project.sandbox_size || "small") as SandboxSize}
            targetSize={pendingSnapshot.tier as SandboxSize}
            currentSpecs={
              DAYTONA_SNAPSHOTS.find((s) => s.tier === project.sandbox_size)
                ?.specs || { cpu: "1", ram: "3GB", disk: "4GB" }
            }
            targetSpecs={pendingSnapshot.specs}
            isLoading={isMigrating}
          />
          <WorkspaceDowngradeConfirmationDialog
            open={showDowngradeDialog}
            onOpenChange={setShowDowngradeDialog}
            onConfirm={handleConfirmMigration}
            currentSize={(project.sandbox_size || "small") as SandboxSize}
            targetSize={pendingSnapshot.tier as SandboxSize}
            currentSpecs={
              DAYTONA_SNAPSHOTS.find((s) => s.tier === project.sandbox_size)
                ?.specs || { cpu: "1", ram: "3GB", disk: "4GB" }
            }
            targetSpecs={pendingSnapshot.specs}
            currentUsage={currentUsage}
            isLoading={isMigrating}
          />
        </>
      )}
    </div>
  );
}
