"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import {
  ArrowUp,
  AlertTriangle,
  Cpu,
  MemoryStick,
  HardDrive,
  Loader2,
} from "lucide-react";
import type { SandboxSize } from "@/vly/lib/sandbox-specs";

interface WorkspaceUpgradeConfirmationDialogProps {
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
  isLoading?: boolean;
}

export function WorkspaceUpgradeConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  currentSize,
  targetSize,
  currentSpecs,
  targetSpecs,
  isLoading = false,
}: WorkspaceUpgradeConfirmationDialogProps) {
  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-purple-100 p-3">
              <ArrowUp className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Upgrade Workspace to {capitalize(targetSize)}?
          </DialogTitle>
          <DialogDescription className="text-center">
            This will increase your workspace resources and migrate your
            project.
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
                <span className="font-medium text-slate-900">
                  {currentSpecs.ram} → {targetSpecs.ram}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <HardDrive className="h-4 w-4" />
                  Disk
                </span>
                <span className="font-medium text-slate-900">
                  {currentSpecs.disk} → {targetSpecs.disk}
                </span>
              </div>
            </div>
          </div>

          {/* Important Notice */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-900">Important Notice</p>
                <p className="mt-2 text-amber-800">
                  Make sure you have the right plan to use{" "}
                  {capitalize(targetSize)} sandboxes:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800">
                  <li>
                    Your plan must include {capitalize(targetSize)} sandbox
                    access
                  </li>
                  <li>You must have available quota for this sandbox size</li>
                  <li>If you downgrade your plan later, you'll need to:</li>
                </ul>
                <ul className="ml-6 mt-1 list-inside list-disc space-y-1 text-amber-800">
                  <li>Upgrade your plan again, or</li>
                  <li>
                    Downgrade this workspace to a tier supported by your plan
                  </li>
                </ul>
                <p className="mt-2 font-semibold text-amber-900">
                  Otherwise, this project will be inaccessible until resolved.
                </p>
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
            disabled={isLoading}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Upgrading...
              </>
            ) : (
              "Confirm Upgrade"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
