import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle } from "lucide-react";
import { PauseStatus } from "../types";
import { formatPauseReason, formatDate } from "../utils";

interface PauseStatusBadgeProps {
  pauseStatus: PauseStatus | null | undefined;
  showDetails?: boolean;
}

export function PauseStatusBadge({
  pauseStatus,
  showDetails = false,
}: PauseStatusBadgeProps) {
  if (!pauseStatus || !pauseStatus.active) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <Badge className="border-green-200 bg-green-50 text-green-700">
          Active
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <Badge className="border-red-200 bg-red-50 text-red-700">Paused</Badge>
      </div>
      {showDetails && (
        <div className="ml-6 space-y-1 text-xs text-zinc-600">
          {pauseStatus.pauseReason && (
            <p>
              <span className="font-medium">Reason:</span>{" "}
              {formatPauseReason(pauseStatus.pauseReason)}
            </p>
          )}
          {pauseStatus.pausedByName && (
            <p>
              <span className="font-medium">Paused by:</span>{" "}
              {pauseStatus.pausedByName} ({pauseStatus.pausedByEmail})
            </p>
          )}
          {pauseStatus._creationTime && (
            <p>
              <span className="font-medium">Paused at:</span>{" "}
              {formatDate(pauseStatus._creationTime)}
            </p>
          )}
          {pauseStatus.autoUnpauseEnabled && (
            <p className="text-amber-600">
              <span className="font-medium">Auto-unpause:</span> Enabled
            </p>
          )}
        </div>
      )}
    </div>
  );
}
