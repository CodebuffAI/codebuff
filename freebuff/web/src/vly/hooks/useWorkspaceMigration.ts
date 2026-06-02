import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/vly/hooks/use-toast";
import { getSnapshotById } from "@/vly/config/daytona-snapshots";
import { tierToSize } from "@/vly/lib/monitoring/monitoring-utils";
import type { SandboxSize } from "@/vly/lib/sandbox-specs";

interface UseWorkspaceMigrationParams {
  projectId: Id<"project"> | undefined;
  currentSandboxSize?: SandboxSize | string;
}

export function useWorkspaceMigration({
  projectId,
  currentSandboxSize,
}: UseWorkspaceMigrationParams) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [isMigrating, setIsMigrating] = useState(false);

  const { toast } = useToast();
  const migrateDaytonaWorkspace = useAction(
    api.codesandbox.export.migrateDaytonaWorkspace,
  );

  const migrate = async () => {
    if (!selectedSnapshotId) {
      toast({
        title: "No snapshot selected",
        description: "Please select a target snapshot to migrate to.",
        variant: "destructive",
      });
      return;
    }

    if (!projectId) {
      toast({
        title: "Project not found",
        description: "Unable to migrate workspace.",
        variant: "destructive",
      });
      return;
    }

    // Get target snapshot and determine target size
    const targetSnapshot = getSnapshotById(selectedSnapshotId);
    if (!targetSnapshot) {
      toast({
        title: "Invalid snapshot",
        description: "The selected snapshot could not be found.",
        variant: "destructive",
      });
      return;
    }

    const targetSize = tierToSize(targetSnapshot.tier);
    const currentSize = (currentSandboxSize as SandboxSize) ?? "small";

    // Quota checking is handled by Autumn during the migration process
    // The paywall dialog will show if they're over quota

    setIsMigrating(true);

    try {
      const result = await migrateDaytonaWorkspace({
        projectId,
        targetSnapshotId: selectedSnapshotId,
      });

      toast({
        title: "Migration successful",
        description: result.message || "Workspace migrated successfully.",
      });

      // Refresh the page to show updated workspace information
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error("Migration failed:", error);

      // Handle specific error codes from backend validation
      if (error?.data?.code === "SANDBOX_ACCESS_DENIED") {
        toast({
          title: "Upgrade Required",
          description:
            error.message ||
            `You need to upgrade your plan to access ${targetSize.charAt(0).toUpperCase() + targetSize.slice(1)} sandboxes.`,
          variant: "destructive",
        });
      } else if (error?.data?.code === "SANDBOX_QUOTA_EXCEEDED") {
        toast({
          title: "Quota Exceeded",
          description:
            error.message ||
            `You've reached your sandbox limit. Upgrade your plan for more ${targetSize} sandboxes.`,
          variant: "destructive",
        });
      } else {
        // Generic error handling
        toast({
          title: "Migration failed",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
          variant: "destructive",
        });
      }
    } finally {
      setIsMigrating(false);
    }
  };

  return {
    selectedSnapshotId,
    setSelectedSnapshotId,
    isMigrating,
    setIsMigrating,
    migrate,
  };
}
