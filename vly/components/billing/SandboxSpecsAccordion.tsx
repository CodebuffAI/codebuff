/**
 * Workspace Specifications Accordion Component
 * Displays workspace quotas by size with usage tracking and project lists
 */

"use client";

import {
  Cpu,
  Database,
  HardDrive,
  ExternalLink,
  ChevronDown,
  Box,
  AlertCircle,
} from "lucide-react";
import { InfoAccordion } from "./InfoAccordion";
import {
  sandboxSpecsBySize,
  getSizeDisplayName,
  type SandboxSize,
} from "@/lib/sandbox-specs";
import { useCustomer } from "autumn-js/react";
import { getSandboxFeatureId } from "@/lib/billing/workspace-quota-utils";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState } from "react";

interface SandboxSpecsAccordionProps {
  /** Whether in organization context (affects display) */
  isOrganizationContext?: boolean;
  /** Organization ID if in org context */
  organizationId?: string;
}

export function SandboxSpecsAccordion({}: SandboxSpecsAccordionProps) {
  const { customer } = useCustomer();
  const [expandedSizes, setExpandedSizes] = useState<Set<SandboxSize>>(
    new Set(),
  );

  // Get all user's projects to count by sandbox size
  const projects = useQuery(api.project.getUserProjects);

  // Count projects by sandbox size (including legacy projects)
  const projectsBySizeMap = new Map<SandboxSize | "legacy", any[]>();
  const legacyProjects: any[] = [];

  projects?.forEach((project) => {
    if (!project.sandbox_size) {
      // Legacy projects without sandbox_size field
      legacyProjects.push(project);
    } else {
      const size = project.sandbox_size as SandboxSize;
      if (!projectsBySizeMap.has(size)) {
        projectsBySizeMap.set(size, []);
      }
      projectsBySizeMap.get(size)!.push(project);
    }
  });

  // Add legacy projects to the map
  if (legacyProjects.length > 0) {
    projectsBySizeMap.set("legacy", legacyProjects);
  }

  const sizes: (SandboxSize | "legacy")[] = [
    "legacy",
    "small",
    "medium",
    "large",
  ];

  const toggleSize = (size: SandboxSize | "legacy") => {
    setExpandedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size as SandboxSize)) {
        next.delete(size as SandboxSize);
      } else {
        next.add(size as SandboxSize);
      }
      return next;
    });
  };

  // Get feature usage for each size
  const getSizeUsage = (
    size: SandboxSize | "legacy",
  ): { current: number; limit: number | "inf" | "legacy" } => {
    if (size === "legacy") {
      // Legacy sandboxes don't have quota tracking
      const projectsWithSize = projectsBySizeMap.get(size) ?? [];
      return {
        current: projectsWithSize.length,
        limit: "legacy", // Special marker for legacy (no limit)
      };
    }

    const featureId = getSandboxFeatureId(size);
    const projectsWithSize = projectsBySizeMap.get(size) ?? [];

    // Get feature from customer.features object (keyed by feature_id with underscores)
    const feature = customer?.features?.[featureId];

    // Small workspaces are ALWAYS unlimited for all plans (including free)
    // If feature data isn't available, default to unlimited for Small
    if (size === "small" && !feature) {
      return {
        current: projectsWithSize.length,
        limit: "inf", // Small is always unlimited
      };
    }

    // If feature doesn't exist in customer object for other sizes, user doesn't have this feature in their plan
    if (!feature) {
      return {
        current: projectsWithSize.length,
        limit: 0, // 0 means not in plan
      };
    }

    // Get the limit from feature data
    // Check unlimited field
    let limit: number | "inf";
    if (feature.unlimited === true) {
      limit = "inf";
    } else {
      limit = feature.included_usage ?? 0;
    }

    // Small workspaces should ALWAYS be unlimited - if we get 0 or undefined, override to "inf"
    if (size === "small" && (limit === 0 || limit === undefined)) {
      limit = "inf";
    }

    return {
      current: projectsWithSize.length, // Always use actual project count for accuracy
      limit, // "inf" means unlimited, 0 means not configured/not in plan
    };
  };

  const summary = customer ? (
    <span className="text-xs font-medium">
      {/* Build summary dynamically, only showing sizes with > 0 projects */}
      {[
        {
          size: "small" as const,
          count: projectsBySizeMap.get("small")?.length ?? 0,
          label: "Small",
        },
        {
          size: "medium" as const,
          count: projectsBySizeMap.get("medium")?.length ?? 0,
          label: "Medium",
        },
        {
          size: "large" as const,
          count: projectsBySizeMap.get("large")?.length ?? 0,
          label: "Large",
        },
        {
          size: "legacy" as const,
          count: legacyProjects.length,
          label: "Legacy",
        },
      ]
        .filter((item) => item.count > 0)
        .map((item, index, arr) => {
          const usage = getSizeUsage(item.size);
          // Check if user has workspaces but no quota (not in plan)
          // Exclude small (always unlimited) and legacy (no quota system)
          const hasQuotaIssue =
            item.size !== "legacy" &&
            item.size !== "small" &&
            usage.limit !== "inf" &&
            usage.limit !== "legacy" &&
            usage.limit === 0 &&
            item.count > 0;

          return (
            <span
              key={item.size}
              className={hasQuotaIssue ? "text-yellow-700" : "text-zinc-600"}
            >
              {item.count} {item.label}
              {index < arr.length - 1 && " · "}
            </span>
          );
        })}
    </span>
  ) : null;

  return (
    <InfoAccordion
      value="sandbox-specs"
      title="Workspace Usage"
      description="Track your workspace usage across different sizes. Upgrade individual workspaces from the project's Usage tab."
      icon={<Box className="h-4 w-4 text-purple-600" />}
      summary={summary}
    >
      <div className="space-y-3">
        {sizes.map((size) => {
          const projectsWithSize = projectsBySizeMap.get(size) ?? [];

          // Skip if there are no projects of this size
          if (projectsWithSize.length === 0) {
            return null;
          }

          const specs = size === "legacy" ? null : sandboxSpecsBySize[size];
          const usage = getSizeUsage(size);
          const isUnlimited = usage.limit === "inf";
          const isLegacy = usage.limit === "legacy";
          const percentUsed =
            isUnlimited || isLegacy
              ? 0
              : (usage.current / (usage.limit as number)) * 100;
          const isNearLimit = percentUsed >= 80;

          // Check if user has workspaces but no quota for this size
          // Small workspaces are always unlimited for all plans, so exclude them
          const hasNoQuota =
            size !== "legacy" &&
            size !== "small" &&
            usage.limit === 0 &&
            projectsWithSize.length > 0;

          const isExpanded = expandedSizes.has(size as SandboxSize);

          const displayName =
            size === "legacy"
              ? "Legacy"
              : getSizeDisplayName(size as SandboxSize);

          return (
            <div
              key={size}
              className={`rounded-lg border transition-all ${
                hasNoQuota
                  ? "border-yellow-300 bg-yellow-50/30"
                  : isNearLimit && !isUnlimited
                    ? "border-orange-300 bg-orange-50/30"
                    : size === "legacy"
                      ? "border-zinc-300/50 bg-zinc-50/50"
                      : "border-zinc-200/50 bg-white/50"
              }`}
            >
              {/* Size Header - Clickable */}
              <button
                onClick={() => toggleSize(size)}
                className="w-full p-4 text-left transition-colors hover:bg-zinc-50/50"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-600 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-900">
                      {displayName} Workspaces
                    </span>
                    {hasNoQuota && (
                      <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        Not in plan
                      </span>
                    )}
                    {!hasNoQuota &&
                      isNearLimit &&
                      !isUnlimited &&
                      !isLegacy && (
                        <span className="rounded-full bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-800">
                          {usage.current}/{usage.limit}
                        </span>
                      )}
                  </div>
                  {specs && (
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" />
                        {specs.vcpu}
                      </span>
                      <span className="flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {specs.ram_gb} GB
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {specs.disk_gb} GB
                      </span>
                    </div>
                  )}
                  {isLegacy && (
                    <span className="text-xs italic text-zinc-500">
                      Pre-quota projects
                    </span>
                  )}
                </div>

                {/* Usage Bar */}
                {isLegacy ? (
                  // Legacy workspaces: just show count, no usage bar
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-700">
                      {usage.current}{" "}
                      {usage.current === 1 ? "workspace" : "workspaces"}
                    </span>
                    <span className="text-zinc-500">No limit</span>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700">Usage</span>
                      <span className="font-mono text-zinc-600">
                        {usage.current} / {isUnlimited ? "∞" : usage.limit}
                      </span>
                    </div>
                    {!isUnlimited && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className={`h-full transition-all ${
                            percentUsed >= 90
                              ? "bg-red-500"
                              : percentUsed >= 80
                                ? "bg-orange-500"
                                : percentUsed >= 60
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                          }`}
                          style={{
                            width: `${Math.min(percentUsed, 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </button>

              {/* Not in Plan Notice */}
              {hasNoQuota && (
                <div className="border-t border-yellow-200 bg-yellow-50 px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-700" />
                    <span className="text-sm font-semibold text-yellow-900">
                      {displayName} Workspaces Not Included
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-yellow-800">
                    Your current plan doesn't include quota for{" "}
                    {displayName.toLowerCase()} workspaces. To continue using
                    these workspaces, either upgrade your plan or downgrade them
                    to Small (always unlimited) from each project's Usage tab.
                  </p>
                </div>
              )}

              {/* Expandable Project List */}
              {isExpanded && projectsWithSize.length > 0 && (
                <div className="border-t border-zinc-200 px-4 pb-4 pt-3">
                  <div className="mb-2 text-xs font-medium text-zinc-700">
                    Projects ({projectsWithSize.length})
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {projectsWithSize.map((project) => (
                      <Link
                        key={project._id}
                        href={`/project/${project.semantic_identifier}`}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        <span className="truncate">
                          {project.name || project.semantic_identifier}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State when expanded */}
              {isExpanded && projectsWithSize.length === 0 && (
                <div className="border-t border-zinc-200 px-4 pb-4 pt-3">
                  <div className="rounded bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                    No projects using {displayName.toLowerCase()} workspaces yet
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </InfoAccordion>
  );
}
