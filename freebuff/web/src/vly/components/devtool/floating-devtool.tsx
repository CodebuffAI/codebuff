"use client";

import { useState, useMemo } from "react";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/vly/components/ui/card";
import { Badge } from "@/vly/components/ui/badge";
import {
  Wrench,
  Pause,
  Play,
  ChevronDown,
  Loader2,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Slider } from "@/vly/components/ui/slider";

type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

interface FlagDefinition {
  key: string;
  description?: string;
  defaultStrategy: RolloutStrategy;
  defaultPercentage?: number;
}

interface DisplayFlag {
  _id?: string;
  key: string;
  rollout_strategy: RolloutStrategy;
  rollout_percentage?: number;
  description?: string;
  isNew?: boolean; // Flag hasn't been created in DB yet
}

// Default flags that should always be shown in devtools
// These will be auto-created in the database on first interaction
const DEFAULT_FLAGS: FlagDefinition[] = [
  {
    key: "billing_enforcement",
    description: "Enforce billing limits and restrictions",
    defaultStrategy: "disabled",
  },
  {
    key: "vly_integrations_enabled",
    description: "Enable VLY platform integrations",
    defaultStrategy: "disabled",
  },
  {
    key: "organizations_enabled",
    description: "Enable organization features",
    defaultStrategy: "disabled",
  },
  {
    key: "referrals_enabled",
    description: "Enable referral program",
    defaultStrategy: "disabled",
  },
  {
    key: "usage_tab_enabled",
    description: "Usage and monitoring tab in project sidebar",
    defaultStrategy: "disabled",
  },
];

const STRATEGY_LABELS: Record<RolloutStrategy, string> = {
  disabled: "Disabled",
  god_only: "God Only",
  beta: "Beta",
  percentage: "Percentage",
  enabled: "Enabled",
};

const STRATEGY_DESCRIPTIONS: Record<RolloutStrategy, string> = {
  disabled: "Off for everyone",
  god_only: "God role only",
  beta: "God + Beta users",
  percentage: "God + Beta + % of users",
  enabled: "On for everyone",
};

const PAUSE_REASONS = [
  { value: "manual_admin", label: "Manual Admin Pause" },
  { value: "db_bandwidth_depleted", label: "DB Bandwidth Depleted" },
  { value: "compute_depleted", label: "Compute Depleted" },
  { value: "db_storage_depleted", label: "DB Storage Depleted" },
  { value: "file_bandwidth_depleted", label: "File Bandwidth Depleted" },
  { value: "function_calls_depleted", label: "Function Calls Depleted" },
];

type PauseReason =
  | "db_bandwidth_depleted"
  | "compute_depleted"
  | "db_storage_depleted"
  | "file_bandwidth_depleted"
  | "function_calls_depleted"
  | "manual_admin";

export function FloatingDevtool() {
  const user = useSignedInUser();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPauseReason, setSelectedPauseReason] =
    useState<PauseReason>("manual_admin");

  const pauseStatus = useQuery(
    api.deployment_queries.getCurrentUserPauseStatus,
  );
  const pauseDeployments = useAction(
    api.deployment_management.pauseCurrentUserDeployments,
  );
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  );

  // Feature flags (only for god users)
  const isGodUser = user?.role === "god";
  const dbFlags = useQuery(
    api.featureFlags.getAllFlags,
    isGodUser ? {} : "skip",
  );
  const setFlag = useMutation(api.featureFlags.setFlag);

  // Merge DB flags with default flags
  const allFlags = useMemo<DisplayFlag[]>(() => {
    if (!isGodUser) return [];

    const flagMap = new Map<string, DisplayFlag>();

    // Add all DB flags
    if (dbFlags) {
      dbFlags.forEach((flag) => {
        // Fallback to "disabled" if rollout_strategy is missing or invalid
        const strategy = flag.rollout_strategy || "disabled";
        const isValidStrategy = [
          "disabled",
          "god_only",
          "beta",
          "percentage",
          "enabled",
        ].includes(strategy);

        flagMap.set(flag.key, {
          _id: flag._id,
          key: flag.key,
          rollout_strategy: isValidStrategy
            ? (strategy as RolloutStrategy)
            : "disabled",
          rollout_percentage: flag.rollout_percentage,
          description: flag.description,
          isNew: false,
        });
      });
    }

    // Add default flags (if not already in DB)
    DEFAULT_FLAGS.forEach((def) => {
      if (!flagMap.has(def.key)) {
        flagMap.set(def.key, {
          key: def.key,
          rollout_strategy: def.defaultStrategy,
          rollout_percentage: def.defaultPercentage,
          description: def.description,
          isNew: true,
        });
      }
    });

    // Convert to array and sort (defaults first, then alphabetically)
    return Array.from(flagMap.values()).sort((a, b) => {
      const aIsDefault = DEFAULT_FLAGS.some((d) => d.key === a.key);
      const bIsDefault = DEFAULT_FLAGS.some((d) => d.key === b.key);
      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return a.key.localeCompare(b.key);
    });
  }, [dbFlags, isGodUser]);

  const [isPausing, setIsPausing] = useState(false);
  const [isUnpausing, setIsUnpausing] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [flagPercentages, setFlagPercentages] = useState<
    Record<string, number>
  >({});

  // Only show for god users
  if (!user || !isGodUser) {
    return null;
  }

  const isPaused = pauseStatus?.active === true;

  const handlePause = async () => {
    setIsPausing(true);
    try {
      const result = await pauseDeployments({
        pauseReason: selectedPauseReason,
      });
      const reasonLabel =
        PAUSE_REASONS.find((r) => r.value === selectedPauseReason)?.label ||
        selectedPauseReason;
      toast.success(
        `Paused ${result.successCount} deployment${result.successCount !== 1 ? "s" : ""} (${reasonLabel})`,
      );
    } catch (error) {
      toast.error(
        `Failed to pause deployments: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsPausing(false);
    }
  };

  const handleUnpause = async () => {
    setIsUnpausing(true);
    try {
      const result = await unpauseDeployments();
      toast.success(
        `Unpaused ${result.successCount} deployment${result.successCount !== 1 ? "s" : ""}`,
      );
    } catch (error) {
      toast.error(
        `Failed to unpause deployments: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsUnpausing(false);
    }
  };

  const handleUpdateFlag = async (
    key: string,
    strategy: RolloutStrategy,
    percentage?: number,
  ) => {
    setTogglingFlag(key);
    try {
      await setFlag({
        key,
        rollout_strategy: strategy,
        rollout_percentage: strategy === "percentage" ? percentage : undefined,
      });
      toast.success(
        `${key} updated to ${STRATEGY_LABELS[strategy]}${strategy === "percentage" ? ` (${percentage}%)` : ""}`,
      );
    } catch (error) {
      toast.error(
        `Failed to update flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTogglingFlag(null);
    }
  };

  const getPauseReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      db_bandwidth_depleted: "DB Bandwidth Depleted",
      compute_depleted: "Compute Depleted",
      db_storage_depleted: "DB Storage Depleted",
      file_bandwidth_depleted: "File Bandwidth Depleted",
      function_calls_depleted: "Function Calls Depleted",
      manual_admin: "Manual Admin Pause",
    };
    return labels[reason] || reason;
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg transition-all hover:scale-110 hover:shadow-xl"
        aria-label="Open devtool"
      >
        <Wrench className="h-5 w-5 text-gray-700" />
        {isPaused && (
          <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 border border-gray-200 bg-white shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-black">
            <Wrench className="h-4 w-4 text-gray-600" />
            Deployment Control
          </CardTitle>
          <button
            onClick={() => setIsExpanded(false)}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
            aria-label="Close devtool"
          >
            <ChevronDown className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {/* Status Section */}
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Status</span>
            {isPaused ? (
              <Badge className="border-red-200 bg-red-100 text-red-700">
                PAUSED
              </Badge>
            ) : (
              <Badge className="border-green-200 bg-green-100 text-green-700">
                RUNNING
              </Badge>
            )}
          </div>

          {isPaused && pauseStatus && (
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <div>
                <span className="font-medium">Reason:</span>{" "}
                {getPauseReasonLabel(pauseStatus.pauseReason)}
              </div>
              <div>
                <span className="font-medium">Paused:</span>{" "}
                {formatDistanceToNow(pauseStatus.pausedAt, { addSuffix: true })}
              </div>
            </div>
          )}
        </div>

        {/* Pause Reason Selector (only show when not paused) */}
        {!isPaused && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">
              Pause Reason
            </label>
            <Select
              value={selectedPauseReason}
              onValueChange={(value) =>
                setSelectedPauseReason(value as PauseReason)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {PAUSE_REASONS.map((reason) => (
                  <SelectItem
                    key={reason.value}
                    value={reason.value}
                    className="text-xs"
                  >
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isPaused ? (
            <Button
              onClick={handleUnpause}
              disabled={isUnpausing}
              className="flex-1 bg-green-600 text-white hover:bg-green-700"
              size="sm"
            >
              {isUnpausing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unpausing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Unpause
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handlePause}
              disabled={isPausing}
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
              size="sm"
            >
              {isPausing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Pausing...
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
          )}
        </div>

        {/* Info Text */}
        <p className="text-xs text-gray-500">
          {isPaused
            ? "Your deployments are currently paused. Click Unpause to resume."
            : "Your deployments are running normally. Click Pause to temporarily stop all deployments."}
        </p>

        {/* Feature Flags Section (God Users Only) */}
        {isGodUser && allFlags && allFlags.length > 0 && (
          <>
            <div className="border-t border-gray-200 pt-3" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-gray-600" />
                <span className="text-xs font-medium text-gray-600">
                  Feature Flags ({allFlags.length})
                </span>
              </div>

              {allFlags.map((flag) => {
                const currentPercentage =
                  flagPercentages[flag.key] ?? flag.rollout_percentage ?? 10;

                return (
                  <div
                    key={flag._id || flag.key}
                    className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2.5"
                  >
                    {/* Flag Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-700">
                          {flag.key}
                        </span>
                        {flag.isNew && (
                          <Badge className="border-amber-200 bg-amber-100 px-1 text-[9px] text-amber-700">
                            NEW
                          </Badge>
                        )}
                        <Badge
                          className={
                            flag.rollout_strategy === "enabled"
                              ? "border-green-200 bg-green-100 text-green-700"
                              : flag.rollout_strategy === "disabled"
                                ? "border-gray-300 bg-gray-200 text-gray-700"
                                : "border-blue-200 bg-blue-100 text-blue-700"
                          }
                        >
                          {STRATEGY_LABELS[flag.rollout_strategy]}
                          {flag.rollout_strategy === "percentage" &&
                            ` ${flag.rollout_percentage}%`}
                        </Badge>
                      </div>
                      {togglingFlag === flag.key && (
                        <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                      )}
                    </div>

                    {/* Strategy Selector */}
                    <Select
                      value={flag.rollout_strategy}
                      onValueChange={(value) =>
                        handleUpdateFlag(
                          flag.key,
                          value as RolloutStrategy,
                          value === "percentage"
                            ? currentPercentage
                            : undefined,
                        )
                      }
                      disabled={togglingFlag === flag.key}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STRATEGY_LABELS).map(
                          ([value, label]) => (
                            <SelectItem
                              key={value}
                              value={value}
                              className="text-xs"
                            >
                              <div className="flex flex-col">
                                <span>{label}</span>
                                <span className="text-[10px] text-gray-500">
                                  {
                                    STRATEGY_DESCRIPTIONS[
                                      value as RolloutStrategy
                                    ]
                                  }
                                </span>
                              </div>
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>

                    {/* Percentage Slider (only for percentage strategy) */}
                    {flag.rollout_strategy === "percentage" && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-600">
                            Rollout: {currentPercentage}%
                          </span>
                        </div>
                        <Slider
                          value={[currentPercentage]}
                          onValueChange={([value]) =>
                            setFlagPercentages((prev) => ({
                              ...prev,
                              [flag.key]: value,
                            }))
                          }
                          onPointerUp={() =>
                            handleUpdateFlag(
                              flag.key,
                              "percentage",
                              currentPercentage,
                            )
                          }
                          min={0}
                          max={100}
                          step={5}
                          className="w-full"
                          disabled={togglingFlag === flag.key}
                        />
                      </div>
                    )}

                    {/* Description (if available) */}
                    {flag.description && (
                      <p className="text-[10px] text-gray-500">
                        {flag.description}
                      </p>
                    )}

                    {/* New flag indicator */}
                    {flag.isNew && (
                      <p className="text-[9px] italic text-amber-600">
                        Will be created in database on first change
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
