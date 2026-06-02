"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Slider } from "@/vly/components/ui/slider";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Checkbox } from "@/vly/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import {
  BarChart2,
  Sliders,
  Settings,
  Loader2,
  Users,
  FolderOpen,
  Activity,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  BookOpen,
  List,
  Grid3x3,
  Tag,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_FLAGS,
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
  CATEGORY_RUNBOOKS,
} from "../constants";
import {
  SectionHeader,
  LoadingState,
  EmptyState,
  FeatureFlagConfirmDialog,
} from "../shared";

type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

interface DisplayFlag {
  _id?: Id<"feature_flags">;
  key: string;
  rollout_strategy: RolloutStrategy;
  rollout_percentage?: number;
  description?: string;
  categories?: string[];
  runbook?: string;
  isNew?: boolean;
}

export function SystemTabContent() {
  // Feature flags
  const dbFlags = useQuery(api.featureFlags.getAllFlags, {});
  const setFlag = useMutation(api.featureFlags.setFlag);
  const deleteFlag = useMutation(api.featureFlags.deleteFlag);
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [deletingFlag, setDeletingFlag] = useState<string | null>(null);
  const [flagToDelete, setFlagToDelete] = useState<DisplayFlag | null>(null);
  const [flagPercentages, setFlagPercentages] = useState<
    Record<string, number>
  >({});
  const [editingDescription, setEditingDescription] = useState<string | null>(
    null,
  );
  const [descriptionValues, setDescriptionValues] = useState<
    Record<string, string>
  >({});
  const [editingCategories, setEditingCategories] = useState<string | null>(
    null,
  );
  const [categoryValues, setCategoryValues] = useState<
    Record<string, string[]>
  >({});
  const [newCategoryInput, setNewCategoryInput] = useState<
    Record<string, string>
  >({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [runbookCategory, setRunbookCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [selectedFlags, setSelectedFlags] = useState<
    Record<string, Set<string>>
  >({});
  const [bulkStrategy, setBulkStrategy] = useState<
    Record<string, RolloutStrategy>
  >({});
  const [applyingBulk, setApplyingBulk] = useState<string | null>(null);
  const [pendingStrategyChange, setPendingStrategyChange] = useState<{
    flag: DisplayFlag;
    newStrategy: RolloutStrategy;
    newPercentage?: number;
  } | null>(null);
  const [pendingBulkChange, setPendingBulkChange] = useState<{
    category: string;
    strategy: RolloutStrategy;
    flagCount: number;
    flags: DisplayFlag[];
  } | null>(null);

  // Platform statistics
  const platformStats = useQuery(api.admin.getPlatformStatistics, {});

  // Merge DB flags with default flags - memoized
  const allFlags = useMemo<DisplayFlag[]>(() => {
    const flagMap = new Map<string, DisplayFlag>();

    // Add all DB flags
    if (dbFlags) {
      dbFlags.forEach((flag) => {
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
          categories: flag.categories,
          runbook: flag.runbook,
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
          rollout_percentage: (def as any).defaultPercentage,
          description: def.description,
          categories: [...def.categories], // Convert readonly array to mutable array
          isNew: true,
        });
      }
    });

    // Convert to array and sort alphabetically
    return Array.from(flagMap.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }, [dbFlags]);

  // Group flags by category (flags can appear in multiple groups)
  const groupedFlags = useMemo(() => {
    const groups = new Map<string, DisplayFlag[]>();
    allFlags.forEach((flag) => {
      const categories =
        flag.categories && flag.categories.length > 0
          ? flag.categories
          : ["Uncategorized"];

      // Add flag to each of its categories
      categories.forEach((category) => {
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category)!.push(flag);
      });
    });

    // Sort flags within each category
    groups.forEach((flags) => {
      flags.sort((a, b) => a.key.localeCompare(b.key));
    });

    return groups;
  }, [allFlags]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Helper to get default description for a flag
  const getDefaultDescription = (key: string): string | undefined => {
    return DEFAULT_FLAGS.find((f) => f.key === key)?.description;
  };

  const handleUpdateFlag = async (
    key: string,
    strategy: RolloutStrategy,
    percentage?: number,
    description?: string,
    categories?: string[],
  ) => {
    setTogglingFlag(key);
    try {
      // If no description provided, use the default description
      const finalDescription = description ?? getDefaultDescription(key);

      // Get default categories if not provided
      const defaultCategories = DEFAULT_FLAGS.find(
        (f) => f.key === key,
      )?.categories;
      const finalCategories =
        categories ?? (defaultCategories ? [...defaultCategories] : undefined);

      await setFlag({
        key,
        rollout_strategy: strategy,
        rollout_percentage: strategy === "percentage" ? percentage : undefined,
        description: finalDescription,
        categories: finalCategories,
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

  const handleSaveDescription = async (flag: DisplayFlag) => {
    const newDescription =
      descriptionValues[flag.key] ?? flag.description ?? "";
    setTogglingFlag(flag.key);
    try {
      await setFlag({
        key: flag.key,
        rollout_strategy: flag.rollout_strategy,
        rollout_percentage: flag.rollout_percentage,
        description: newDescription,
        categories: flag.categories,
      });
      toast.success(`Description updated for ${flag.key}`);
      setEditingDescription(null);
    } catch (error) {
      toast.error(
        `Failed to update description: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTogglingFlag(null);
    }
  };

  const handleDeleteFlag = async (flag: DisplayFlag) => {
    if (!flag._id) {
      toast.error("Cannot delete a flag that is not in the database");
      return;
    }

    setDeletingFlag(flag.key);
    try {
      await deleteFlag({ flagId: flag._id });
      toast.success(
        `${flag.key} cleared from Convex. Now using default value.`,
      );
      setFlagToDelete(null);
    } catch (error) {
      toast.error(
        `Failed to delete flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setDeletingFlag(null);
    }
  };

  const handleSaveCategories = async (flag: DisplayFlag) => {
    const newCategories = categoryValues[flag.key] ?? flag.categories ?? [];
    setTogglingFlag(flag.key);
    try {
      await setFlag({
        key: flag.key,
        rollout_strategy: flag.rollout_strategy,
        rollout_percentage: flag.rollout_percentage,
        description: flag.description,
        categories: newCategories.length > 0 ? newCategories : undefined,
      });
      toast.success(`Categories updated for ${flag.key}`);
      setEditingCategories(null);
    } catch (error) {
      toast.error(
        `Failed to update categories: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTogglingFlag(null);
    }
  };

  const handleAddCategory = (flagKey: string, category: string) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return;

    setCategoryValues((prev) => {
      const current = prev[flagKey] ?? [];
      if (current.includes(trimmedCategory)) {
        return prev;
      }
      return {
        ...prev,
        [flagKey]: [...current, trimmedCategory],
      };
    });
    setNewCategoryInput((prev) => ({
      ...prev,
      [flagKey]: "",
    }));
  };

  const handleRemoveCategory = (flagKey: string, category: string) => {
    setCategoryValues((prev) => ({
      ...prev,
      [flagKey]: (prev[flagKey] ?? []).filter((c) => c !== category),
    }));
  };

  const toggleFlagSelection = (category: string, flagKey: string) => {
    setSelectedFlags((prev) => {
      const categorySet = prev[category] ?? new Set<string>();
      const newSet = new Set(categorySet);
      if (newSet.has(flagKey)) {
        newSet.delete(flagKey);
      } else {
        newSet.add(flagKey);
      }
      return {
        ...prev,
        [category]: newSet,
      };
    });
  };

  const handleBulkUpdate = async (category: string) => {
    const selected = selectedFlags[category];
    if (!selected || selected.size === 0) {
      toast.error("No flags selected");
      return;
    }

    const strategy = bulkStrategy[category];
    if (!strategy) {
      toast.error("Please select a strategy");
      return;
    }

    const flags = groupedFlags.get(category) ?? [];
    const flagsToUpdate = flags.filter((f) => selected.has(f.key));

    // Show confirmation dialog
    setPendingBulkChange({
      category,
      strategy,
      flagCount: flagsToUpdate.length,
      flags: flagsToUpdate,
    });
  };

  const handleConfirmBulkChange = async () => {
    if (!pendingBulkChange) return;

    const { category, strategy, flags } = pendingBulkChange;

    setApplyingBulk(category);
    setPendingBulkChange(null);

    let successCount = 0;
    let errorCount = 0;

    for (const flag of flags) {
      try {
        await handleUpdateFlag(
          flag.key,
          strategy,
          strategy === "percentage" ? 10 : undefined,
          flag.description,
          flag.categories,
        );
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`Failed to update ${flag.key}:`, error);
      }
    }

    setApplyingBulk(null);
    setSelectedFlags((prev) => ({
      ...prev,
      [category]: new Set(),
    }));

    if (errorCount === 0) {
      toast.success(
        `Updated ${successCount} flags to ${STRATEGY_LABELS[strategy]}`,
      );
    } else {
      toast.warning(`Updated ${successCount} flags, ${errorCount} failed`);
    }
  };

  const handleConfirmStrategyChange = async () => {
    if (!pendingStrategyChange) return;

    const { flag, newStrategy, newPercentage } = pendingStrategyChange;
    await handleUpdateFlag(
      flag.key,
      newStrategy,
      newStrategy === "percentage" ? newPercentage : undefined,
      flag.description,
      flag.categories,
    );
    setPendingStrategyChange(null);
  };

  return (
    <div className="space-y-6">
      {/* PLATFORM STATISTICS SECTION */}
      <div className="space-y-4">
        <SectionHeader
          icon={BarChart2}
          title="Platform Statistics"
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
          borderColor="border-blue-200"
        />

        {!platformStats ? (
          <LoadingState message="Loading platform statistics..." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Users Stats */}
            <div className="space-y-3 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-900">Users</h4>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">Total</span>
                  <span className="text-lg font-bold text-blue-700">
                    {platformStats.users.total.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-1 border-t border-blue-200 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      Active (24h)
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-[10px] text-blue-700"
                    >
                      {platformStats.users.active24h}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      Active (7d)
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-[10px] text-blue-700"
                    >
                      {platformStats.users.active7d}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      Active (30d)
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-[10px] text-blue-700"
                    >
                      {platformStats.users.active30d}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1 border-t border-blue-200 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      Recent Signups
                    </span>
                    <Badge className="bg-green-600 text-[10px] hover:bg-green-700">
                      +{platformStats.users.recentSignups}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      Free / Paid
                    </span>
                    <span className="text-[10px] font-medium text-zinc-700">
                      {platformStats.users.freeUsers} /{" "}
                      {platformStats.users.paidUsers}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Projects Stats */}
            <div className="space-y-3 rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-100">
                  <FolderOpen className="h-4 w-4 text-purple-600" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-900">
                  Projects
                </h4>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">Total</span>
                  <span className="text-lg font-bold text-purple-700">
                    {platformStats.projects.total.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-md border border-purple-200 bg-purple-50/50 p-2">
                  <p className="text-[10px] text-zinc-600">
                    Average per user:{" "}
                    <span className="font-bold text-purple-700">
                      {(
                        platformStats.projects.total /
                        Math.max(platformStats.users.total, 1)
                      ).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Convex Projects Stats */}
            <div className="space-y-3 rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-green-100/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-100">
                  <Activity className="h-4 w-4 text-green-600" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-900">
                  Convex Projects
                </h4>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">Total</span>
                  <span className="text-lg font-bold text-green-700">
                    {platformStats.convexProjects.total.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-1 border-t border-green-200 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Active</span>
                    <Badge className="bg-green-600 text-[10px] hover:bg-green-700">
                      {platformStats.convexProjects.active}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Paused</span>
                    <Badge variant="destructive" className="text-[10px]">
                      {platformStats.convexProjects.paused}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-md border border-green-200 bg-green-50/50 p-2">
                  <p className="text-[10px] text-zinc-600">
                    Health:{" "}
                    <span className="font-bold text-green-700">
                      {(
                        (platformStats.convexProjects.active /
                          Math.max(platformStats.convexProjects.total, 1)) *
                        100
                      ).toFixed(1)}
                      % Active
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FEATURE FLAGS SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-orange-200 bg-orange-50">
              <Sliders className="h-4 w-4 text-orange-600" />
            </div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              Feature Flags
              {allFlags && allFlags.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {allFlags.length}
                </Badge>
              )}
            </h3>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
            <Button
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className="h-6 gap-1 px-2 text-[10px]"
            >
              <Grid3x3 className="h-3 w-3" />
              Grouped
            </Button>
            <Button
              variant={viewMode === "flat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("flat")}
              className="h-6 gap-1 px-2 text-[10px]"
            >
              <List className="h-3 w-3" />
              Flat
            </Button>
          </div>
        </div>

        {!allFlags || allFlags.length === 0 ? (
          <LoadingState message="Loading feature flags..." />
        ) : viewMode === "grouped" ? (
          <div className="space-y-3">
            {Array.from(groupedFlags.entries()).map(([category, flags]) => {
              const isCollapsed = collapsedCategories.has(category);
              const runbook = CATEGORY_RUNBOOKS[category];

              return (
                <div
                  key={category}
                  className="rounded-lg border border-orange-200 bg-white shadow-sm"
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCategory(category)}
                        className="h-6 w-6 p-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-orange-600" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-orange-600" />
                        )}
                      </Button>
                      <h4 className="text-sm font-semibold text-orange-900">
                        {category}
                      </h4>
                      <Badge variant="secondary" className="text-[10px]">
                        {flags.length}
                      </Badge>
                      {(selectedFlags[category]?.size ?? 0) > 0 && (
                        <Badge
                          variant="default"
                          className="bg-blue-600 text-[10px]"
                        >
                          {selectedFlags[category]?.size} selected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {runbook && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRunbookCategory(
                              runbookCategory === category ? null : category,
                            )
                          }
                          className="h-7 gap-1.5 text-xs text-orange-700 hover:bg-orange-100"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Runbook
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bulk Actions Bar */}
                  {!isCollapsed && (
                    <div className="border-b border-orange-100 bg-blue-50/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-zinc-700">
                          Bulk Actions:
                        </span>
                        <Select
                          value={bulkStrategy[category] || ""}
                          onValueChange={(value) =>
                            setBulkStrategy((prev) => ({
                              ...prev,
                              [category]: value as RolloutStrategy,
                            }))
                          }
                        >
                          <SelectTrigger className="h-7 w-[140px] text-[11px]">
                            <SelectValue placeholder="Select strategy" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STRATEGY_LABELS).map(
                              ([value, label]) => (
                                <SelectItem
                                  key={value}
                                  value={value}
                                  className="text-xs"
                                >
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={() => handleBulkUpdate(category)}
                          disabled={
                            !bulkStrategy[category] ||
                            (selectedFlags[category]?.size ?? 0) === 0 ||
                            applyingBulk === category
                          }
                          className="h-7 gap-1 text-[11px]"
                        >
                          {applyingBulk === category ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Applying...
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" />
                              Apply to Selected (
                              {selectedFlags[category]?.size ?? 0})
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Runbook Content */}
                  {runbookCategory === category && runbook && (
                    <div className="border-b border-orange-100 bg-amber-50/30 px-3 py-2">
                      <div className="prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap text-[11px] text-zinc-700">
                          {runbook}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50">
                            <th className="w-10 px-3 py-2 text-center">
                              <Checkbox
                                checked={
                                  flags.length > 0 &&
                                  flags.every((f) =>
                                    selectedFlags[category]?.has(f.key),
                                  )
                                }
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedFlags((prev) => ({
                                      ...prev,
                                      [category]: new Set(
                                        flags.map((f) => f.key),
                                      ),
                                    }));
                                  } else {
                                    setSelectedFlags((prev) => ({
                                      ...prev,
                                      [category]: new Set(),
                                    }));
                                  }
                                }}
                              />
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                              Flag
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                              Categories
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                              Description
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                              Strategy
                            </th>
                            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-zinc-600">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {flags.map((flag: DisplayFlag) => {
                            const currentPercentage =
                              flagPercentages[flag.key] ??
                              flag.rollout_percentage ??
                              10;

                            return (
                              <tr
                                key={flag._id || flag.key}
                                className="group border-b border-zinc-100 transition-colors hover:bg-zinc-50/50"
                              >
                                {/* Checkbox */}
                                <td className="px-3 py-2.5 text-center">
                                  <Checkbox
                                    checked={
                                      selectedFlags[category]?.has(flag.key) ??
                                      false
                                    }
                                    onCheckedChange={() =>
                                      toggleFlagSelection(category, flag.key)
                                    }
                                  />
                                </td>

                                {/* Flag Name */}
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[12px] font-semibold text-zinc-900">
                                      {flag.key}
                                    </span>
                                    {flag.isNew ? (
                                      <Badge className="border-amber-300 bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                                        DEFAULT
                                      </Badge>
                                    ) : (
                                      <Badge className="border-blue-300 bg-blue-100 px-1 text-[9px] font-medium text-blue-800">
                                        IN CONVEX
                                      </Badge>
                                    )}
                                  </div>
                                </td>

                                {/* Categories */}
                                <td className="px-3 py-2.5">
                                  {editingCategories === flag.key ? (
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap gap-1">
                                        {(
                                          categoryValues[flag.key] ??
                                          flag.categories ??
                                          []
                                        ).map((cat) => (
                                          <Badge
                                            key={cat}
                                            variant="outline"
                                            className="group/badge flex items-center gap-1 px-1.5 py-0 text-[9px]"
                                          >
                                            {cat}
                                            <button
                                              onClick={() =>
                                                handleRemoveCategory(
                                                  flag.key,
                                                  cat,
                                                )
                                              }
                                              className="opacity-0 transition-opacity group-hover/badge:opacity-100"
                                            >
                                              <X className="h-2.5 w-2.5 text-red-600" />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Input
                                          value={
                                            newCategoryInput[flag.key] ?? ""
                                          }
                                          onChange={(e) =>
                                            setNewCategoryInput((prev) => ({
                                              ...prev,
                                              [flag.key]: e.target.value,
                                            }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              handleAddCategory(
                                                flag.key,
                                                newCategoryInput[flag.key] ??
                                                  "",
                                              );
                                            }
                                          }}
                                          placeholder="Add category..."
                                          className="h-6 text-[10px]"
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleAddCategory(
                                              flag.key,
                                              newCategoryInput[flag.key] ?? "",
                                            )
                                          }
                                          className="h-6 w-6 p-0"
                                        >
                                          <Plus className="h-3 w-3 text-green-600" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleSaveCategories(flag)
                                          }
                                          disabled={togglingFlag === flag.key}
                                          className="h-6 w-6 p-0"
                                        >
                                          <Check className="h-3 w-3 text-green-600" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setEditingCategories(null);
                                            setCategoryValues((prev) => {
                                              const newValues = { ...prev };
                                              delete newValues[flag.key];
                                              return newValues;
                                            });
                                            setNewCategoryInput((prev) => {
                                              const newValues = { ...prev };
                                              delete newValues[flag.key];
                                              return newValues;
                                            });
                                          }}
                                          className="h-6 w-6 p-0"
                                        >
                                          <X className="h-3 w-3 text-red-600" />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex flex-wrap gap-1">
                                        {flag.categories &&
                                        flag.categories.length > 0 ? (
                                          flag.categories.map((cat) => (
                                            <Badge
                                              key={cat}
                                              variant="outline"
                                              className="px-1.5 py-0 text-[9px]"
                                            >
                                              {cat}
                                            </Badge>
                                          ))
                                        ) : (
                                          <span className="text-[10px] italic text-zinc-400">
                                            No categories
                                          </span>
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingCategories(flag.key);
                                          setCategoryValues((prev) => ({
                                            ...prev,
                                            [flag.key]: flag.categories ?? [],
                                          }));
                                        }}
                                        className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-60"
                                      >
                                        <Tag className="h-3 w-3 text-zinc-400" />
                                      </Button>
                                    </div>
                                  )}
                                </td>

                                {/* Description */}
                                <td className="px-3 py-2.5">
                                  {editingDescription === flag.key ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={
                                          descriptionValues[flag.key] ??
                                          flag.description ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          setDescriptionValues((prev) => ({
                                            ...prev,
                                            [flag.key]: e.target.value,
                                          }))
                                        }
                                        placeholder="Add description..."
                                        className="h-7 text-[11px]"
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          handleSaveDescription(flag)
                                        }
                                        disabled={togglingFlag === flag.key}
                                        className="h-7 w-7 p-0"
                                      >
                                        <Check className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingDescription(null);
                                          setDescriptionValues((prev) => {
                                            const newValues = { ...prev };
                                            delete newValues[flag.key];
                                            return newValues;
                                          });
                                        }}
                                        className="h-7 w-7 p-0"
                                      >
                                        <X className="h-3.5 w-3.5 text-red-600" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-[11px] text-zinc-600">
                                        {flag.description || (
                                          <span className="italic text-zinc-400">
                                            No description
                                          </span>
                                        )}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingDescription(flag.key);
                                          setDescriptionValues((prev) => ({
                                            ...prev,
                                            [flag.key]: flag.description ?? "",
                                          }));
                                        }}
                                        className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-60"
                                      >
                                        <Pencil className="h-3 w-3 text-zinc-400" />
                                      </Button>
                                    </div>
                                  )}
                                </td>

                                {/* Strategy */}
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={flag.rollout_strategy}
                                      onValueChange={(value) =>
                                        setPendingStrategyChange({
                                          flag,
                                          newStrategy: value as RolloutStrategy,
                                          newPercentage:
                                            value === "percentage"
                                              ? currentPercentage
                                              : undefined,
                                        })
                                      }
                                      disabled={togglingFlag === flag.key}
                                    >
                                      <SelectTrigger className="h-7 w-[140px] text-[11px]">
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
                                              <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">
                                                  {label}
                                                </span>
                                                <span className="text-[10px] text-zinc-500">
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

                                    {/* Percentage Slider (inline) */}
                                    {flag.rollout_strategy === "percentage" && (
                                      <div className="flex items-center gap-2">
                                        <Slider
                                          value={[currentPercentage]}
                                          onValueChange={([value]: number[]) =>
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
                                              flag.description,
                                              flag.categories,
                                            )
                                          }
                                          min={0}
                                          max={100}
                                          step={5}
                                          className="w-[100px]"
                                          disabled={togglingFlag === flag.key}
                                        />
                                        <span className="text-[11px] font-bold text-blue-700">
                                          {currentPercentage}%
                                        </span>
                                      </div>
                                    )}

                                    {togglingFlag === flag.key && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                                    )}
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="px-3 py-2.5 text-center">
                                  {!flag.isNew && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setFlagToDelete(flag)}
                                      disabled={
                                        togglingFlag === flag.key ||
                                        deletingFlag === flag.key
                                      }
                                      className="h-7 gap-1 text-[10px] text-red-600 hover:bg-red-50 hover:text-red-700"
                                    >
                                      {deletingFlag === flag.key ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat view - single table with all flags */
          <div className="overflow-x-auto rounded-lg border border-orange-200 bg-white shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                    Flag
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                    Categories
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-zinc-600">
                    Strategy
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-zinc-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allFlags.map((flag: DisplayFlag) => {
                  const currentPercentage =
                    flagPercentages[flag.key] ?? flag.rollout_percentage ?? 10;

                  return (
                    <tr
                      key={flag._id || flag.key}
                      className="group border-b border-zinc-100 transition-colors hover:bg-zinc-50/50"
                    >
                      {/* Flag Name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px] font-semibold text-zinc-900">
                            {flag.key}
                          </span>
                          {flag.isNew ? (
                            <Badge className="border-amber-300 bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                              DEFAULT
                            </Badge>
                          ) : (
                            <Badge className="border-blue-300 bg-blue-100 px-1 text-[9px] font-medium text-blue-800">
                              IN CONVEX
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Categories */}
                      <td className="px-3 py-2.5">
                        {editingCategories === flag.key ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {(
                                categoryValues[flag.key] ??
                                flag.categories ??
                                []
                              ).map((cat) => (
                                <Badge
                                  key={cat}
                                  variant="outline"
                                  className="group/badge flex items-center gap-1 px-1.5 py-0 text-[9px]"
                                >
                                  {cat}
                                  <button
                                    onClick={() =>
                                      handleRemoveCategory(flag.key, cat)
                                    }
                                    className="opacity-0 transition-opacity group-hover/badge:opacity-100"
                                  >
                                    <X className="h-2.5 w-2.5 text-red-600" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                            <div className="flex items-center gap-1">
                              <Input
                                value={newCategoryInput[flag.key] ?? ""}
                                onChange={(e) =>
                                  setNewCategoryInput((prev) => ({
                                    ...prev,
                                    [flag.key]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleAddCategory(
                                      flag.key,
                                      newCategoryInput[flag.key] ?? "",
                                    );
                                  }
                                }}
                                placeholder="Add category..."
                                className="h-6 text-[10px]"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handleAddCategory(
                                    flag.key,
                                    newCategoryInput[flag.key] ?? "",
                                  )
                                }
                                className="h-6 w-6 p-0"
                              >
                                <Plus className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveCategories(flag)}
                                disabled={togglingFlag === flag.key}
                                className="h-6 w-6 p-0"
                              >
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCategories(null);
                                  setCategoryValues((prev) => {
                                    const newValues = { ...prev };
                                    delete newValues[flag.key];
                                    return newValues;
                                  });
                                  setNewCategoryInput((prev) => {
                                    const newValues = { ...prev };
                                    delete newValues[flag.key];
                                    return newValues;
                                  });
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-wrap gap-1">
                              {flag.categories && flag.categories.length > 0 ? (
                                flag.categories.map((cat) => (
                                  <Badge
                                    key={cat}
                                    variant="outline"
                                    className="px-1.5 py-0 text-[9px]"
                                  >
                                    {cat}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-[10px] italic text-zinc-400">
                                  Uncategorized
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingCategories(flag.key);
                                setCategoryValues((prev) => ({
                                  ...prev,
                                  [flag.key]: flag.categories ?? [],
                                }));
                              }}
                              className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-60"
                            >
                              <Tag className="h-3 w-3 text-zinc-400" />
                            </Button>
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2.5">
                        {editingDescription === flag.key ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={
                                descriptionValues[flag.key] ??
                                flag.description ??
                                ""
                              }
                              onChange={(e) =>
                                setDescriptionValues((prev) => ({
                                  ...prev,
                                  [flag.key]: e.target.value,
                                }))
                              }
                              placeholder="Add description..."
                              className="h-7 text-[11px]"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSaveDescription(flag)}
                              disabled={togglingFlag === flag.key}
                              className="h-7 w-7 p-0"
                            >
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingDescription(null);
                                setDescriptionValues((prev) => {
                                  const newValues = { ...prev };
                                  delete newValues[flag.key];
                                  return newValues;
                                });
                              }}
                              className="h-7 w-7 p-0"
                            >
                              <X className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <p className="text-[11px] text-zinc-600">
                              {flag.description || (
                                <span className="italic text-zinc-400">
                                  No description
                                </span>
                              )}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingDescription(flag.key);
                                setDescriptionValues((prev) => ({
                                  ...prev,
                                  [flag.key]: flag.description ?? "",
                                }));
                              }}
                              className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-60"
                            >
                              <Pencil className="h-3 w-3 text-zinc-400" />
                            </Button>
                          </div>
                        )}
                      </td>

                      {/* Strategy */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Select
                            value={flag.rollout_strategy}
                            onValueChange={(value) =>
                              setPendingStrategyChange({
                                flag,
                                newStrategy: value as RolloutStrategy,
                                newPercentage:
                                  value === "percentage"
                                    ? currentPercentage
                                    : undefined,
                              })
                            }
                            disabled={togglingFlag === flag.key}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-[11px]">
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
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-medium">
                                        {label}
                                      </span>
                                      <span className="text-[10px] text-zinc-500">
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

                          {/* Percentage Slider (inline) */}
                          {flag.rollout_strategy === "percentage" && (
                            <div className="flex items-center gap-2">
                              <Slider
                                value={[currentPercentage]}
                                onValueChange={([value]: number[]) =>
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
                                    flag.description,
                                    flag.categories,
                                  )
                                }
                                min={0}
                                max={100}
                                step={5}
                                className="w-[100px]"
                                disabled={togglingFlag === flag.key}
                              />
                              <span className="text-[11px] font-bold text-blue-700">
                                {currentPercentage}%
                              </span>
                            </div>
                          )}

                          {togglingFlag === flag.key && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-center">
                        {!flag.isNew && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFlagToDelete(flag)}
                            disabled={
                              togglingFlag === flag.key ||
                              deletingFlag === flag.key
                            }
                            className="h-7 gap-1 text-[10px] text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            {deletingFlag === flag.key ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GLOBAL SETTINGS SECTION */}
      <div className="space-y-4">
        <SectionHeader
          icon={Settings}
          title="Global Settings"
          iconColor="text-purple-600"
          iconBgColor="bg-purple-50"
          borderColor="border-purple-200"
        />
        <EmptyState
          icon={Settings}
          title="Global settings coming soon"
          description="Maintenance mode, announcements, defaults"
        />
      </div>

      {/* CONFIRMATION DIALOG FOR CLEARING FLAGS */}
      <AlertDialog
        open={!!flagToDelete}
        onOpenChange={(open) => !open && setFlagToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear feature flag from Convex?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>
                Are you sure you want to clear{" "}
                <span className="font-mono font-semibold text-zinc-900">
                  {flagToDelete?.key}
                </span>{" "}
                from Convex?
              </div>
              <div className="text-amber-700">
                This will remove the database record and revert to the default
                value:{" "}
                <span className="font-semibold">
                  {flagToDelete &&
                    STRATEGY_LABELS[
                      DEFAULT_FLAGS.find((f) => f.key === flagToDelete.key)
                        ?.defaultStrategy || "disabled"
                    ]}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => flagToDelete && handleDeleteFlag(flagToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              Clear Flag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMATION DIALOG FOR SINGLE STRATEGY CHANGES */}
      {pendingStrategyChange && (
        <FeatureFlagConfirmDialog
          mode="single"
          open={!!pendingStrategyChange}
          onOpenChange={(open) => !open && setPendingStrategyChange(null)}
          onConfirm={handleConfirmStrategyChange}
          flag={pendingStrategyChange.flag}
          newStrategy={pendingStrategyChange.newStrategy}
          newPercentage={pendingStrategyChange.newPercentage}
          strategyLabels={STRATEGY_LABELS}
          strategyDescriptions={STRATEGY_DESCRIPTIONS}
        />
      )}

      {/* CONFIRMATION DIALOG FOR BULK CHANGES */}
      {pendingBulkChange && (
        <FeatureFlagConfirmDialog
          mode="bulk"
          open={!!pendingBulkChange}
          onOpenChange={(open) => !open && setPendingBulkChange(null)}
          onConfirm={handleConfirmBulkChange}
          flags={pendingBulkChange.flags}
          newStrategy={pendingBulkChange.strategy}
          category={pendingBulkChange.category}
          strategyLabels={STRATEGY_LABELS}
          strategyDescriptions={STRATEGY_DESCRIPTIONS}
        />
      )}
    </div>
  );
}
