import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export type ProjectRuntimeSurface = "web" | "cloud";

interface UseProjectConnectionParams {
  semanticIdentifier: string | undefined;
  onSuccess?: () => void;
  runtimeSurface?: ProjectRuntimeSurface;
}

interface CheckProjectConnectionOptions {
  silentSuccessToast?: boolean;
  silentErrorToast?: boolean;
}

/** Heuristic mirror of the server-side disk-pressure classifier. */
export function isDiskPressureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("no space left") ||
    m.includes("enospc") ||
    m.includes("disk full") ||
    m.includes("out of disk") ||
    m.includes("disk quota") ||
    m.includes("no space") ||
    (m.includes("disk") && m.includes("full"))
  );
}

function connectionErrorToast(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isDiskPressureMessage(message)) {
    toast.error("⚠️ Cloud VM is out of storage", {
      description:
        "Large installs filled the VM disk. Free up space or increase storage from the VM status menu.",
    });
    return;
  }
  toast.error("⚠️ Failed to connect to project");
}

export function useProjectConnection({
  semanticIdentifier,
  onSuccess,
  runtimeSurface = "web",
}: UseProjectConnectionParams) {
  const pathname = usePathname();
  const verifyProjectAccessAndConnectWebAction = useAction(
    api.codesandbox.management.verifyProjectAccessAndConnect,
  );
  const verifyProjectAccessAndConnectCloudAction = useAction(
    (api as any).cloud.connection.verifyProjectAccessAndConnect,
  );
  const isCloudRoute =
    runtimeSurface === "cloud" || pathname?.startsWith("/cloud/") === true;
  const runtimeSurfaceKey: ProjectRuntimeSurface = isCloudRoute
    ? "cloud"
    : "web";

  const verifyProjectAccessAndConnectAction = isCloudRoute
    ? verifyProjectAccessAndConnectCloudAction
    : verifyProjectAccessAndConnectWebAction;

  const hasToasted = useRef(false);

  const checkProjectConnection = useCallback(
    async (options: CheckProjectConnectionOptions = {}) => {
      if (!semanticIdentifier) {
        return {
          success: false as const,
          skipped: true as const,
        };
      }

      try {
        await verifyProjectAccessAndConnectAction({
          semanticIdentifier,
        });

        return {
          success: true as const,
        };
      } catch (error) {
        console.error("Failed to verify project access:", error);
        if (!options.silentErrorToast) {
          connectionErrorToast(error);
        }
        return {
          success: false as const,
          error,
        };
      }
    },
    [semanticIdentifier, verifyProjectAccessAndConnectAction],
  );

  // Use useQuery for automatic, declarative data fetching
  // React Query handles deduplication, caching, and prevents duplicate requests
  const query = useQuery({
    queryKey: ["projectConnection", runtimeSurfaceKey, semanticIdentifier],
    queryFn: async () => {
      if (!semanticIdentifier) {
        throw new Error("No semantic identifier provided");
      }
      return await verifyProjectAccessAndConnectAction({
        semanticIdentifier,
      });
    },
    enabled: !!semanticIdentifier, // Only run when we have a semantic identifier
    staleTime: Infinity, // Never goes stale - connection is one-time setup
    gcTime: Infinity, // Keep in cache indefinitely (was cacheTime in v4)
    refetchOnWindowFocus: false, // Don't refetch on tab switch
    refetchOnReconnect: false, // Don't refetch on network reconnect
    refetchOnMount: false, // Don't refetch on remount
    retry: false, // No retries - fail fast and show error to user
  });

  // Handle success/error toasts
  useEffect(() => {
    if (query.isSuccess && !hasToasted.current) {
      hasToasted.current = true;
      onSuccess?.();
    } else if (query.isError && !hasToasted.current) {
      hasToasted.current = true;
      console.error("Failed to verify project access:", query.error);
      connectionErrorToast(query.error);
    }
  }, [query.isSuccess, query.isError, query.error, onSuccess]);

  return {
    isConnecting: query.isPending,
    isError: query.isError,
    error: query.error,
    isSuccess: query.isSuccess,
    fetchStatus: query.fetchStatus,
    checkProjectConnection,
  };
}
