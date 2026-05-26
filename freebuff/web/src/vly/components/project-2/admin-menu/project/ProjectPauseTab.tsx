"use client";

import { Button } from "@/vly/components/ui/button";
import { Label } from "@/vly/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Badge } from "@/vly/components/ui/badge";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/vly/lib/utils";
import { formatDate, formatPauseReason } from "../utils";

interface PauseStatus {
  active: boolean;
  pauseReason?: string;
  pausedAt?: number;
  pausedByName?: string;
}

interface PauseResults {
  totalDeployments: number;
  successCount: number;
  failureCount: number;
  results?: Array<{
    projectName: string;
    type: string;
    success: boolean;
  }>;
}

interface ProjectPauseTabProps {
  projectPauseStatus: PauseStatus | null | undefined;
  pauseReason: string;
  setPauseReason: (reason: string) => void;
  isPausing: boolean;
  pauseResults: PauseResults | null;
  onPauseProject: () => Promise<void>;
}

export function ProjectPauseTab({
  projectPauseStatus,
  pauseReason,
  setPauseReason,
  isPausing,
  pauseResults,
  onPauseProject,
}: ProjectPauseTabProps) {
  return (
    <>
      {/* Status Display */}
      {projectPauseStatus && (
        <div
          className={cn(
            "rounded-lg border p-5 shadow-sm transition-all",
            projectPauseStatus?.active
              ? "border-red-200 bg-gradient-to-br from-red-50 to-red-100/30"
              : "border-green-200 bg-gradient-to-br from-green-50 to-green-100/30",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded",
                  projectPauseStatus?.active ? "bg-red-100" : "bg-green-100",
                )}
              >
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    projectPauseStatus?.active ? "bg-red-500" : "bg-green-500",
                  )}
                />
              </div>
              Project Pause Status
            </h3>
            <Badge
              variant={projectPauseStatus?.active ? "destructive" : "default"}
              className={
                projectPauseStatus?.active
                  ? "shadow-sm"
                  : "bg-green-600 text-white shadow-sm hover:bg-green-700"
              }
            >
              {projectPauseStatus?.active ? "Paused" : "Active"}
            </Badge>
          </div>

          {projectPauseStatus?.active && (
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between border-b border-red-100 py-2">
                <span className="font-medium text-zinc-600">Reason</span>
                <span className="font-semibold text-zinc-900">
                  {formatPauseReason(projectPauseStatus.pauseReason || "")}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-red-100 py-2">
                <span className="font-medium text-zinc-600">Paused</span>
                <span className="text-xs text-zinc-900">
                  {formatDate(projectPauseStatus.pausedAt || 0)}
                </span>
              </div>
              {projectPauseStatus.pausedByName && (
                <div className="flex items-center justify-between py-2">
                  <span className="font-medium text-zinc-600">Paused by</span>
                  <span className="text-zinc-900">
                    {projectPauseStatus.pausedByName}
                  </span>
                </div>
              )}
            </div>
          )}

          {!projectPauseStatus?.active && (
            <p className="text-sm text-zinc-700">
              Project deployments are currently active and running.
            </p>
          )}
        </div>
      )}

      {/* Pause controls - only show if not paused */}
      {!projectPauseStatus?.active && (
        <div className="grid gap-2.5">
          <Label
            htmlFor="project-pause-reason"
            className="text-xs font-semibold uppercase tracking-wide text-zinc-700"
          >
            Pause Reason
          </Label>
          <Select value={pauseReason} onValueChange={setPauseReason}>
            <SelectTrigger className="h-10 border-zinc-300 bg-white transition-colors hover:border-zinc-400">
              <SelectValue placeholder="Select pause reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual_admin">Manual Admin</SelectItem>
              <SelectItem value="db_bandwidth_depleted">
                DB Bandwidth Depleted
              </SelectItem>
              <SelectItem value="compute_depleted">Compute Depleted</SelectItem>
              <SelectItem value="file_bandwidth_depleted">
                File Bandwidth Depleted
              </SelectItem>
              <SelectItem value="function_calls_depleted">
                Function Calls Depleted
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-end">
        <Button
          onClick={onPauseProject}
          disabled={isPausing}
          variant={projectPauseStatus?.active ? "default" : "destructive"}
          className="w-full shadow-sm transition-all hover:shadow-md"
        >
          {isPausing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPausing
            ? projectPauseStatus?.active
              ? "Unpausing..."
              : "Pausing..."
            : projectPauseStatus?.active
              ? "Unpause This Project"
              : "Pause This Project"}
        </Button>
      </div>

      {/* Results Display */}
      {pauseResults && (
        <div className="space-y-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/30 p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100">
              <Check className="h-3.5 w-3.5 text-blue-600" />
            </div>
            Operation Results
          </h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between border-b border-blue-100 py-2">
              <span className="font-medium text-zinc-600">
                Total Deployments
              </span>
              <Badge variant="secondary" className="font-semibold">
                {pauseResults.totalDeployments}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-blue-100 py-2">
              <span className="font-medium text-zinc-600">Successful</span>
              <Badge className="bg-green-600 font-semibold hover:bg-green-700">
                {pauseResults.successCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-medium text-zinc-600">Failed</span>
              <Badge variant="destructive" className="font-semibold">
                {pauseResults.failureCount}
              </Badge>
            </div>
          </div>

          {pauseResults.results && pauseResults.results.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                Details
              </p>
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-2">
                {pauseResults.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded bg-white/60 p-2 text-xs"
                  >
                    <span className="font-medium text-zinc-700">
                      {result.projectName}{" "}
                      <span className="text-zinc-500">({result.type})</span>
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        result.success ? "text-green-600" : "text-red-600",
                      )}
                    >
                      {result.success ? "✓" : "✗"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
