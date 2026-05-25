"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  AlertTriangle,
  Cpu,
  MemoryStick,
  HardDrive,
  Loader2,
} from "lucide-react";
import type { SandboxSize } from "@/lib/sandbox-specs";

interface WorkspaceDowngradeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  currentSize: SandboxSize;
  targetSize: SandboxSize;
  currentSpecs: {
    cpu: string;
    ram: string;
    disk: string;
  };
  targetSpecs: {
    cpu: string;
    ram: string;
    disk: string;
  };
  currentUsage?: {
    ram: number;
    disk: number;
  };
  isLoading?: boolean;
}

export function WorkspaceDowngradeConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  currentSize,
  targetSize,
  currentSpecs,
  targetSpecs,
  currentUsage,
  isLoading = false,
}: WorkspaceDowngradeConfirmationDialogProps) {
  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  // Check if current usage might exceed new limits
  const targetRamGB = parseFloat(targetSpecs.ram);
  const targetDiskGB = parseFloat(targetSpecs.disk);
  const ramExceeded = currentUsage && currentUsage.ram > targetRamGB;
  const diskExceeded = currentUsage && currentUsage.disk > targetDiskGB;
  const hasExceededLimits = ramExceeded || diskExceeded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-orange-100 p-3">
              <RefreshCw className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Downgrade Workspace to {capitalize(targetSize)}?
          </DialogTitle>
          <DialogDescription className="text-center">
            This will reduce your workspace resources and migrate your project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resource Comparison */}
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-700">
              Resource Changes
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Cpu className="h-4 w-4" />
                  CPU
                </span>
                <span className="font-medium text-slate-900">
                  {currentSpecs.cpu} → {targetSpecs.cpu}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <MemoryStick className="h-4 w-4" />
                  RAM
                </span>
                <span
                  className={`font-medium ${ramExceeded ? "text-red-600" : "text-slate-900"}`}
                >
                  {currentSpecs.ram} → {targetSpecs.ram}
                  {currentUsage && (
                    <span className="ml-1 text-xs text-slate-500">
                      (using {currentUsage.ram.toFixed(1)}GB)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <HardDrive className="h-4 w-4" />
                  Disk
                </span>
                <span
                  className={`font-medium ${diskExceeded ? "text-red-600" : "text-slate-900"}`}
                >
                  {currentSpecs.disk} → {targetSpecs.disk}
                  {currentUsage && (
                    <span className="ml-1 text-xs text-slate-500">
                      (using {currentUsage.disk.toFixed(1)}GB)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Usage Warning */}
          <div
            className={`rounded-lg border p-4 ${
              hasExceededLimits
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                  hasExceededLimits ? "text-red-600" : "text-amber-600"
                }`}
              />
              <div className="flex-1 text-sm">
                {hasExceededLimits ? (
                  <>
                    <p className="font-semibold text-red-900">
                      Current Usage Exceeds New Limits
                    </p>
                    <p className="mt-1 text-red-800">
                      Your workspace is currently using more{" "}
                      {ramExceeded && diskExceeded
                        ? "RAM and disk space"
                        : ramExceeded
                          ? "RAM"
                          : "disk space"}{" "}
                      than the {capitalize(targetSize)} tier provides. The
                      downgrade may fail or cause data loss.
                    </p>
                    <p className="mt-2 text-red-800">
                      Please reduce your usage before downgrading, or choose a
                      larger tier.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-amber-900">
                      Important: Resource Constraints
                    </p>
                    <p className="mt-1 text-amber-800">
                      Your workspace RAM and disk usage must fit within the new
                      limits for the downgrade to succeed.
                    </p>
                    <p className="mt-2 text-amber-800">
                      <strong>New limits:</strong> {targetSpecs.ram} RAM,{" "}
                      {targetSpecs.disk} disk space
                    </p>
                    {currentUsage && (
                      <p className="mt-1 text-amber-800">
                        <strong>Current usage:</strong>{" "}
                        {currentUsage.ram.toFixed(1)}
                        GB RAM, {currentUsage.disk.toFixed(1)}GB disk
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Migration Info */}
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs text-blue-800">
              Your workspace will be migrated and all files will be transferred.
              This process typically takes less than 30 seconds.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || hasExceededLimits}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downgrading...
              </>
            ) : (
              "Confirm Downgrade"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
