"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

interface DisplayFlag {
  _id?: any;
  key: string;
  rollout_strategy: RolloutStrategy;
  rollout_percentage?: number;
  description?: string;
  categories?: string[];
  runbook?: string;
  isNew?: boolean;
}

interface FeatureFlagConfirmDialogProps {
  mode: "single" | "bulk";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  flag?: DisplayFlag;
  flags?: DisplayFlag[];
  newStrategy: RolloutStrategy;
  newPercentage?: number;
  category?: string;
  strategyLabels: Record<RolloutStrategy, string>;
  strategyDescriptions: Record<RolloutStrategy, string>;
}

export function FeatureFlagConfirmDialog({
  mode,
  open,
  onOpenChange,
  onConfirm,
  flag,
  flags,
  newStrategy,
  newPercentage,
  category,
  strategyLabels,
  strategyDescriptions,
}: FeatureFlagConfirmDialogProps) {
  const flagCount = mode === "bulk" ? (flags?.length ?? 0) : 1;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "single"
              ? "Change feature flag strategy?"
              : "Bulk update feature flags?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "single" ? (
              <>
                Are you sure you want to change the rollout strategy for{" "}
                <span className="font-mono font-semibold text-zinc-900">
                  {flag?.key}
                </span>
                ?
              </>
            ) : (
              <>
                Are you sure you want to update{" "}
                <span className="font-semibold text-zinc-900">
                  {flagCount} flag{flagCount !== 1 ? "s" : ""}
                </span>{" "}
                in the{" "}
                <span className="font-semibold text-zinc-900">{category}</span>{" "}
                category?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {/* PRODUCTION WARNING BANNER */}
          <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <div className="font-bold text-red-900">
                THIS WILL AFFECT ALL PRODUCTION USERS
              </div>
              <p className="mt-1 text-xs text-red-800">
                Feature flag changes apply immediately to the production
                environment and will impact user experience.
              </p>
            </div>
          </div>

          {/* STRATEGY DETAILS */}
          {mode === "single" && flag ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div className="mb-2 font-medium text-zinc-700">Change:</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">From:</span>
                  <Badge variant="outline" className="font-medium">
                    {strategyLabels[flag.rollout_strategy]}
                  </Badge>
                  {flag.rollout_strategy === "percentage" && (
                    <span className="text-xs text-zinc-500">
                      ({flag.rollout_percentage}%)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">To:</span>
                  <Badge className="bg-blue-600 font-medium">
                    {strategyLabels[newStrategy]}
                  </Badge>
                  {newStrategy === "percentage" && (
                    <span className="text-xs text-zinc-500">
                      ({newPercentage}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div className="mb-2 font-medium text-zinc-700">
                New Strategy:
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-600 font-medium">
                  {strategyLabels[newStrategy]}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                {strategyDescriptions[newStrategy]}
              </p>
            </div>
          )}

          {/* STRATEGY DESCRIPTION */}
          {mode === "single" && (
            <div className="text-xs text-zinc-600">
              {strategyDescriptions[newStrategy]}
            </div>
          )}

          {/* BULK: LIST OF FLAGS */}
          {mode === "bulk" && flags && flags.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-xs font-medium text-amber-900">
                Flags to be updated:
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {flags.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono font-medium text-zinc-900">
                      {f.key}
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      {strategyLabels[f.rollout_strategy]}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mode === "single" ? (
              "Confirm Change"
            ) : (
              <>
                Update {flagCount} Flag{flagCount !== 1 ? "s" : ""}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
