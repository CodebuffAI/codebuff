import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "framer-motion";
import {
  ExternalLink,
  MousePointer,
  RotateCw,
  Github,
  Camera,
  MonitorCog,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useIframeNavigationSync } from "./useIframeNavigationSync";
import { useIsMobile } from "@/vly/hooks/use-mobile";
import { Spinner3D } from "./Spinner3D";
import styles from "./CenterContent.module.css";
import { useProjectConnection } from "@/vly/hooks/useProjectConnection";
import { toast } from "sonner";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { getExternalPreviewUrl } from "@/vly/lib/project-preview-url";
import { GravityAdSlot } from "./agent-chat/GravityAdSlot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";

// @ts-ignore
type EntryPoint = FunctionReturnType<typeof api.project.getEntryPoints>[number];
type SyncStatus = FunctionReturnType<
  typeof api.github.repositories.getProjectSyncStatus
>;

interface CenterContentProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | null;
  activeEntryPoint: EntryPoint | undefined;
  entryPoints: EntryPoint[];
  isSelectingElement: boolean;
  onCurrentPageChange?: (currentPageUrl: string) => void;
  syncStatus?: SyncStatus;
  /**
   * Bump from the parent to force the iframe to reload — used right after
   * the first build settles on brand-new projects.
   */
  refreshTrigger?: number;
  /**
   * Force the "Click to test" overlay to be visible — used when the chat
   * pane is expanded so the iframe is clearly secondary until the user
   * clicks back into it.
   */
  forceShowClickToTest?: boolean;
  /**
   * Fired when the user clicks the "Click to test" overlay. The parent
   * uses this to shrink the chat pane back to its default width — the
   * user is signaling they want to interact with the preview.
   */
  onClickToTest?: () => void;
}

type ScreenshotTrigger = "auto" | "manual";
type PreviewConnectionStatus =
  | "loading"
  | "booting"
  | "connected"
  | "error"
  | "idle"
  | "restarting";

const MAX_AUTO_SCREENSHOT_FAILURES = 3;

const connectionStatusMeta: Record<
  PreviewConnectionStatus,
  {
    label: string;
    dotClassName: string;
    pingClassName?: string;
  }
> = {
  loading: {
    label: "Loading connection status",
    dotClassName: "bg-muted-foreground",
    pingClassName: "bg-muted-foreground/50",
  },
  booting: {
    label: "Booting preview",
    dotClassName: "bg-amber-300",
    pingClassName: "bg-amber-300/50",
  },
  connected: {
    label: "Connected",
    dotClassName: "bg-emerald-400",
  },
  error: {
    label: "Connection error",
    dotClassName: "bg-red-400",
  },
  idle: {
    label: "Idle",
    dotClassName: "bg-muted-foreground/70",
  },
  restarting: {
    label: "Restarting computer",
    dotClassName: "bg-amber-300",
    pingClassName: "bg-amber-300/50",
  },
};

function clearScreenshotTimeout(
  screenshotTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>,
) {
  if (screenshotTimeoutRef.current) {
    clearTimeout(screenshotTimeoutRef.current);
    screenshotTimeoutRef.current = null;
  }
}

function clearActiveScreenshotRequest({
  screenshotTimeoutRef,
  activeScreenshotRequestIdRef,
  activeScreenshotTriggerRef,
}: {
  screenshotTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  activeScreenshotRequestIdRef: React.MutableRefObject<string | null>;
  activeScreenshotTriggerRef: React.MutableRefObject<ScreenshotTrigger | null>;
}) {
  clearScreenshotTimeout(screenshotTimeoutRef);
  activeScreenshotRequestIdRef.current = null;
  activeScreenshotTriggerRef.current = null;
}

function resetAutoScreenshotFailures({
  autoScreenshotFailureCountRef,
  setAutoScreenshotLimitReached,
}: {
  autoScreenshotFailureCountRef: React.MutableRefObject<number>;
  setAutoScreenshotLimitReached: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  autoScreenshotFailureCountRef.current = 0;
  setAutoScreenshotLimitReached(false);
}

function registerScreenshotFailure({
  trigger,
  reason,
  autoScreenshotFailureCountRef,
  setAutoScreenshotLimitReached,
}: {
  trigger: ScreenshotTrigger | null;
  reason: string;
  autoScreenshotFailureCountRef: React.MutableRefObject<number>;
  setAutoScreenshotLimitReached: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  if (trigger !== "auto") {
    return;
  }

  const nextFailureCount = autoScreenshotFailureCountRef.current + 1;
  autoScreenshotFailureCountRef.current = nextFailureCount;

  if (nextFailureCount !== MAX_AUTO_SCREENSHOT_FAILURES) {
    return;
  }

  console.warn("[Auto Screenshot] Pausing automatic retries", {
    reason,
    nextFailureCount,
  });
  setAutoScreenshotLimitReached(true);
}

function startScreenshotCapture({
  trigger,
  iframe,
  projectId,
  autoScreenshotLimitReached,
  setIsCapturingScreenshot,
  screenshotTimeoutRef,
  activeScreenshotRequestIdRef,
  activeScreenshotTriggerRef,
  autoScreenshotFailureCountRef,
  setAutoScreenshotLimitReached,
}: {
  trigger: ScreenshotTrigger;
  iframe: HTMLIFrameElement | null;
  projectId: string | undefined;
  autoScreenshotLimitReached: boolean;
  setIsCapturingScreenshot: React.Dispatch<React.SetStateAction<boolean>>;
  screenshotTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  activeScreenshotRequestIdRef: React.MutableRefObject<string | null>;
  activeScreenshotTriggerRef: React.MutableRefObject<ScreenshotTrigger | null>;
  autoScreenshotFailureCountRef: React.MutableRefObject<number>;
  setAutoScreenshotLimitReached: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  if (!iframe?.contentWindow || !projectId) {
    console.error("[Screenshot] Cannot capture - iframe not ready");
    if (trigger === "manual") {
      toast.error("Cannot capture screenshot - iframe not ready");
    }
    return;
  }

  if (trigger === "auto" && autoScreenshotLimitReached) {
    console.warn("[Auto Screenshot] Retry limit reached, skipping request");
    return;
  }

  setIsCapturingScreenshot(true);
  if (trigger === "manual") {
    toast.info("📸 Capturing screenshot...");
  }

  const requestId = `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  activeScreenshotRequestIdRef.current = requestId;
  activeScreenshotTriggerRef.current = trigger;
  clearScreenshotTimeout(screenshotTimeoutRef);

  const timeout = setTimeout(() => {
    if (activeScreenshotRequestIdRef.current !== requestId) {
      return;
    }

    console.error("[Screenshot] Timeout - no response after 15s");
    registerScreenshotFailure({
      trigger,
      reason: "timeout",
      autoScreenshotFailureCountRef,
      setAutoScreenshotLimitReached,
    });
    clearActiveScreenshotRequest({
      screenshotTimeoutRef,
      activeScreenshotRequestIdRef,
      activeScreenshotTriggerRef,
    });
    if (trigger === "manual") {
      toast.error(
        "Screenshot timeout - @vly-ai/integrations may not be loaded",
      );
    }
    setIsCapturingScreenshot(false);
  }, 15000);

  screenshotTimeoutRef.current = timeout;

  iframe.contentWindow.postMessage(
    {
      type: "vly-screenshot-request",
      requestId,
      format: "png",
      quality: 0.85,
    },
    "*",
  );
}

export function CenterContent({
  project,
  activeEntryPoint,
  entryPoints,
  isSelectingElement,
  onCurrentPageChange,
  syncStatus,
  refreshTrigger = 0,
  forceShowClickToTest = false,
  onClickToTest,
}: CenterContentProps) {
  const [isIframeActive, setIsIframeActive] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const isMobile = useIsMobile();
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previousProjectStateRef = useRef<
    "initializing" | "unassigned" | "active" | "processing" | undefined
  >(undefined);
  const isPostApplyConnectionCheckRunningRef = useRef(false);
  const restartDevServerAction = useAction(
    api.codesandbox.management.restartDevServer,
  );

  // Auth check for god mode features
  const user = useSignedInUser();
  const isGodMode = user?.role === "god";

  // Screenshot functionality using @vly-ai/integrations
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [isScreenshotUnsupported, setIsScreenshotUnsupported] = useState(false);
  const [autoScreenshotLimitReached, setAutoScreenshotLimitReached] =
    useState(false);
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeScreenshotRequestIdRef = useRef<string | null>(null);
  const activeScreenshotTriggerRef = useRef<ScreenshotTrigger | null>(null);
  const autoScreenshotFailureCountRef = useRef(0);
  const [isIframeReactReady, setIsIframeReactReady] = useState(false);
  const [hasIframeLoaded, setHasIframeLoaded] = useState(false);
  const projectId = project?._id;

  // Check if auto screenshot should be triggered (based on commit count)
  const shouldUpdateScreenshot = useQuery(
    api.screenshot.shouldUpdateScreenshot,
    projectId ? { projectId } : "skip",
  );

  // Use the custom hook for all navigation logic
  const {
    navState,
    canGoBack,
    canGoForward,
    handleBack,
    handleForward,
    activeEntryPointByPath,
    baseUrl,
  } = useIframeNavigationSync({
    project,
    entryPoints,
    activeEntryPoint,
    setActiveEntryPoint: () => {},
  });
  const isDaytonaProject = project?.sandbox_id?.startsWith("daytona:") === true;

  React.useEffect(() => {
    clearActiveScreenshotRequest({
      screenshotTimeoutRef,
      activeScreenshotRequestIdRef,
      activeScreenshotTriggerRef,
    });
    setIsCapturingScreenshot(false);
    setIsScreenshotUnsupported(false);
    resetAutoScreenshotFailures({
      autoScreenshotFailureCountRef,
      setAutoScreenshotLimitReached,
    });
  }, [projectId]);

  React.useEffect(() => {
    if (!shouldUpdateScreenshot) {
      resetAutoScreenshotFailures({
        autoScreenshotFailureCountRef,
        setAutoScreenshotLimitReached,
      });
    }
  }, [shouldUpdateScreenshot]);

  React.useEffect(() => {
    return () => {
      clearActiveScreenshotRequest({
        screenshotTimeoutRef,
        activeScreenshotRequestIdRef,
        activeScreenshotTriggerRef,
      });
    };
  }, []);

  React.useEffect(() => {
    const handleRouteChange = (event: MessageEvent) => {
      if (event.data?.type === "iframe-route-change") {
        setIsIframeReactReady(true);
      }
    };
    window.addEventListener("message", handleRouteChange);
    return () => window.removeEventListener("message", handleRouteChange);
  }, []);

  React.useEffect(() => {
    setIsIframeReactReady(false);
    setHasIframeLoaded(false);

    if (!isDaytonaProject || !navState.iframeSrc) {
      return;
    }

    // Daytona previews are already public and loaded directly in the iframe.
    // If the connection action lags behind the browser load, don't keep a
    // full-screen cover over a preview the user can already see.
    const timeoutId = window.setTimeout(() => {
      setHasIframeLoaded(true);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [isDaytonaProject, navState.iframeKey, navState.iframeSrc]);

  const handleRefresh = React.useCallback(() => {
    const iframe = iframeRef.current;
    const currentPath = navState.stack[navState.index];
    if (iframe && baseUrl && currentPath) {
      // Refresh the current page the user is viewing, not the original URL
      const currentUrl = new URL(currentPath, baseUrl);
      // Skip _refresh for freebuff.dev (pretty preview) - it breaks styles. Only use for dev preview URLs.
      if (!baseUrl.includes("freebuff.dev")) {
        currentUrl.searchParams.set("_refresh", Date.now().toString());
      }
      iframe.src = currentUrl.toString();
    }
  }, [baseUrl, navState.index, navState.stack]);

  // External refresh trigger (e.g. first-build reveal): bump from parent
  // and we reload the iframe once we have a valid src to point at.
  const lastRefreshTriggerRef = useRef<number>(refreshTrigger);
  React.useEffect(() => {
    if (refreshTrigger === lastRefreshTriggerRef.current) return;
    lastRefreshTriggerRef.current = refreshTrigger;
    if (!navState.iframeSrc) return;
    // Small delay so any in-flight nav settles first.
    const id = window.setTimeout(() => handleRefresh(), 250);
    return () => window.clearTimeout(id);
  }, [refreshTrigger, handleRefresh, navState.iframeSrc]);

  // Parent-driven "show overlay": when the chat is expanded the iframe is
  // visually secondary, so we surface the click-to-test affordance and
  // forfeit iframe focus until the user clicks back in.
  React.useEffect(() => {
    if (forceShowClickToTest) {
      setIsIframeActive(false);
    }
  }, [forceShowClickToTest]);

  // Mobile: the user has to deliberately tap the Preview tab to land here,
  // so there's no risk of accidental iframe focus — skip the overlay and
  // let them interact with the preview immediately. Desktop still uses
  // the overlay to keep iframe scroll from stealing the chat scroll.
  React.useEffect(() => {
    if (isMobile && !forceShowClickToTest) {
      setIsIframeActive(true);
    }
  }, [isMobile, forceShowClickToTest]);

  // Use React Query for automatic project connection
  // React Query handles deduplication and prevents duplicate requests automatically
  const {
    isConnecting,
    isError: isConnectionError,
    isSuccess: isConnectionSuccess,
    checkProjectConnection,
  } = useProjectConnection({
    semanticIdentifier: project?.semantic_identifier,
    onSuccess: () => {
      // Force refresh the iframe content after successful connection. Only
      // skip pretty-domain previews because programmatic reloads break styles.
      if (baseUrl.includes("freebuff.dev")) return;
      setTimeout(() => {
        handleRefresh();
      }, 1000); // Small delay to ensure connection is fully established
    },
  });
  const shouldShowConnectionOverlay =
    isConnecting &&
    !(isDaytonaProject && (hasIframeLoaded || isIframeReactReady));
  const isPreviewLoaded = hasIframeLoaded || isIframeReactReady;
  const connectionStatus: PreviewConnectionStatus = (() => {
    if (!project) return "loading";
    if (isRestarting) return "restarting";
    if (isConnectionError) return "error";
    if (isConnecting) return navState.iframeSrc ? "booting" : "loading";
    if (isConnectionSuccess) return "connected";
    if (project.state === "processing" || project.state === "initializing") {
      return "booting";
    }
    if (isDaytonaProject && isPreviewLoaded) return "connected";
    if (!project.semantic_identifier || !navState.iframeSrc) return "idle";
    return "idle";
  })();
  const connectionStatusInfo = connectionStatusMeta[connectionStatus];

  // After changes are applied (processing -> non-processing), re-run the same
  // connection check used on page load to prevent preview disconnects.
  React.useEffect(() => {
    const currentState = project?.state;
    const previousState = previousProjectStateRef.current;
    const changesJustApplied =
      previousState === "processing" && currentState !== "processing";

    previousProjectStateRef.current = currentState;

    if (!changesJustApplied) {
      return;
    }
    if (!project?.semantic_identifier) {
      return;
    }
    if (isPostApplyConnectionCheckRunningRef.current) {
      return;
    }

    isPostApplyConnectionCheckRunningRef.current = true;

    void (async () => {
      try {
        const result = await checkProjectConnection({
          silentSuccessToast: true,
        });

        // Keep the post-apply health check, but do not auto-reload the preview.
        // Users can refresh manually from the preview controls when needed.
        void result;
      } finally {
        isPostApplyConnectionCheckRunningRef.current = false;
      }
    })();
  }, [
    project?.state,
    project?.semantic_identifier,
    checkProjectConnection,
  ]);

  // Remove overlay when selecting element
  React.useEffect(() => {
    if (isSelectingElement) {
      setIsIframeActive(true);
      // Send postMessage to iframe to enable select mode
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "vly-toolbar-enable-select" },
          "*",
        );
      } else {
        window.parent.postMessage({ type: "vly-toolbar-enable-select" }, "*");
      }
    } else {
      // When selection mode is toggled off, tell iframe to disable select mode
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "vly-toolbar-disable-select" },
          "*",
        );
      } else {
        window.parent.postMessage({ type: "vly-toolbar-disable-select" }, "*");
      }
    }
  }, [isSelectingElement]);

  // Report current page URL changes to parent
  React.useEffect(() => {
    const currentPath = navState.stack[navState.index];
    if (onCurrentPageChange && currentPath) {
      // Only pass the path portion (e.g., "/", "/home", "/web/dashboard")
      onCurrentPageChange(currentPath);
    }
  }, [navState.stack, navState.index, onCurrentPageChange]);

  // Overlay click logic: tell the parent the user wants to engage with
  // the iframe so it can shrink the chat back to its default size, then
  // pass clicks through to the iframe itself.
  const handleOverlayClick = () => {
    onClickToTest?.();
    setIsIframeActive(true);
  };

  const handleOpenInNewTab = () => {
    const externalPreviewUrl = getExternalPreviewUrl(project);
    if (externalPreviewUrl) {
      window.open(externalPreviewUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleRestartDevServer = async () => {
    if (!project) return;
    try {
      setIsRestarting(true);
      await restartDevServerAction({
        projectId: project._id,
      });
      alert("Development server restarted successfully!");
      // Also refresh the iframe after restart
      setTimeout(() => {
        handleRefresh();
      }, 2000);
    } catch {
      alert("Failed to restart development server. Please try again later.");
    } finally {
      setIsRestarting(false);
    }
  };

  // Listen for screenshot response from @vly-ai/integrations/project-thumbnail
  React.useEffect(() => {
    const handleScreenshotMessage = async (event: MessageEvent) => {
      const { type, dataUrl, error, requestId } = event.data ?? {};
      const activeRequestId = activeScreenshotRequestIdRef.current;

      // Log screenshot messages only
      if (type?.startsWith("vly-screenshot")) {
      }

      if (
        type?.startsWith("vly-screenshot") &&
        (!activeRequestId || requestId !== activeRequestId)
      ) {
        console.log("[Screenshot] Ignoring stale screenshot message", {
          type,
          requestId,
          activeRequestId,
        });
        return;
      }

      // Handle screenshot error
      if (type === "vly-screenshot-error") {
        console.error("[Screenshot] Runtime error:", error);
        const trigger = activeScreenshotTriggerRef.current;
        clearActiveScreenshotRequest({
          screenshotTimeoutRef,
          activeScreenshotRequestIdRef,
          activeScreenshotTriggerRef,
        });

        // Special handling for oklch color function error
        if (typeof error === "string" && error.includes("oklch")) {
          console.warn(
            "[Screenshot] oklch color detected - screenshots not supported for this project",
          );
          setIsScreenshotUnsupported(true);

          if (trigger === "manual") {
            toast.error(
              "Screenshot not supported: This app uses oklch() CSS colors. Convert to rgb() or hex() for screenshot support.",
              { duration: 5000 },
            );
          }
        } else {
          registerScreenshotFailure({
            trigger,
            reason: String(error ?? "runtime_error"),
            autoScreenshotFailureCountRef,
            setAutoScreenshotLimitReached,
          });
          if (trigger === "manual") {
            toast.error(`Screenshot failed: ${error ?? "Unknown error"}`);
          }
        }

        setIsCapturingScreenshot(false);
        return;
      }

      // Only handle vly-screenshot-response messages
      if (type !== "vly-screenshot-response") return;

      const trigger = activeScreenshotTriggerRef.current;

      // Clear timeout since we got a response
      clearScreenshotTimeout(screenshotTimeoutRef);

      if (!dataUrl) {
        console.error("[Screenshot] No dataUrl in response");
        registerScreenshotFailure({
          trigger,
          reason: "missing_data",
          autoScreenshotFailureCountRef,
          setAutoScreenshotLimitReached,
        });
        clearActiveScreenshotRequest({
          screenshotTimeoutRef,
          activeScreenshotRequestIdRef,
          activeScreenshotTriggerRef,
        });
        if (trigger === "manual") {
          toast.error("Screenshot failed: No data received");
        }
        setIsCapturingScreenshot(false);
        return;
      }

      try {
        // Convert base64 data URL to blob
        const base64Data = dataUrl.split(",")[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        console.log(
          `[Screenshot] Blob created: ${(blob.size / 1024).toFixed(2)} KB`,
        );

        // Upload directly to HTTP endpoint (which uploads to R2)
        if (!projectId) {
          throw new Error("Project not available for screenshot upload");
        }
        const uploadUrl = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/screenshot/upload?projectId=${projectId}&requestId=${Date.now()}`;

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          body: blob,
          headers: {
            "Content-Type": "image/png",
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }
        resetAutoScreenshotFailures({
          autoScreenshotFailureCountRef,
          setAutoScreenshotLimitReached,
        });
        if (trigger === "manual") {
          toast.success("✅ Screenshot saved!");
        }
      } catch (error) {
        console.error("[Screenshot] Upload error:", error);
        registerScreenshotFailure({
          trigger,
          reason: error instanceof Error ? error.message : "upload_error",
          autoScreenshotFailureCountRef,
          setAutoScreenshotLimitReached,
        });
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        if (trigger === "manual") {
          toast.error(`Failed to save screenshot: ${errorMessage}`);
        }
      } finally {
        clearActiveScreenshotRequest({
          screenshotTimeoutRef,
          activeScreenshotRequestIdRef,
          activeScreenshotTriggerRef,
        });
        setIsCapturingScreenshot(false);
      }
    };

    window.addEventListener("message", handleScreenshotMessage);
    return () => window.removeEventListener("message", handleScreenshotMessage);
  }, [projectId]);

  // Auto screenshot: trigger ONLY when ALL conditions are met
  React.useEffect(() => {
    // Skip if ANY condition not met
    if (
      !shouldUpdateScreenshot ||
      !isIframeReactReady ||
      project?.state === "processing" ||
      isCapturingScreenshot ||
      isScreenshotUnsupported ||
      autoScreenshotLimitReached ||
      !iframeRef.current?.contentWindow
    ) {
      return;
    }

    // Wait 10 seconds after React ready to ensure content/data is loaded
    const autoScreenshotDelay = setTimeout(() => {
      if (project?.state === "processing") {
        return;
      }

      startScreenshotCapture({
        trigger: "auto",
        iframe: iframeRef.current,
        projectId,
        autoScreenshotLimitReached,
        setIsCapturingScreenshot,
        screenshotTimeoutRef,
        activeScreenshotRequestIdRef,
        activeScreenshotTriggerRef,
        autoScreenshotFailureCountRef,
        setAutoScreenshotLimitReached,
      });
    }, 10000); // 10 second delay after React ready

    return () => clearTimeout(autoScreenshotDelay);
  }, [
    projectId,
    shouldUpdateScreenshot,
    isIframeReactReady,
    project?.state,
    isCapturingScreenshot,
    isScreenshotUnsupported,
    autoScreenshotLimitReached,
  ]);

  // Add click outside listener to reactivate overlay
  React.useEffect(() => {
    if (!isIframeActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        iframeContainerRef.current &&
        !iframeContainerRef.current.contains(event.target as Node)
      ) {
        setIsIframeActive(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, {
      passive: true,
    });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isIframeActive]);

  if (!activeEntryPoint) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-muted-foreground">
        <p>Select a page to view its content.</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col px-0 pb-0 pt-0 lg:px-3 lg:pb-3 lg:pt-2"
      suppressHydrationWarning
    >
      <div className="flex h-full w-full flex-col items-stretch justify-start gap-0 lg:gap-2">
        {/* --- Compact URL bar (Lovable-style). Hidden on mobile so the
              iframe gets the full available height; the floating "Open
              in new tab" + bottom Chat tab cover navigation needs. --- */}
        <TooltipProvider delayDuration={200}>
          <div
            className="hidden w-full min-w-[220px] items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 lg:flex"
            style={{ minHeight: 32 }}
          >
            <div className="flex items-center gap-0.5">
                <ToolbarTooltip label="Back">
                  <button
                    onClick={handleBack}
                    disabled={!canGoBack}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Back"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M10 13L5 8L10 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip label="Forward">
                  <button
                    onClick={handleForward}
                    disabled={!canGoForward}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Forward"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M6 13L11 8L6 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip label="Refresh preview">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefresh();
                    }}
                    disabled={!navState.iframeSrc}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Refresh"
                  >
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </ToolbarTooltip>
              </div>
              <span
                className="hidden shrink-0 select-text truncate px-1.5 font-mono text-[11px] text-muted-foreground xl:inline-block xl:max-w-[140px]"
                style={{ letterSpacing: 0.2 }}
              >
                {navState.stack[navState.index] || (
                  <span className="opacity-40">/</span>
                )}
              </span>
              {/* Always-present flex-1 spacer so the status + action buttons
                  stay right-aligned even when no ad renders, and the ad sits
                  centered in the available space. */}
              <div className="flex min-w-0 flex-1 items-center justify-center">
                <GravityAdSlot
                  messages={[
                    {
                      role: "user",
                      content: `Previewing ${project?.name || project?.semantic_identifier || "a project"} in Freebuff Web`,
                    },
                  ]}
                  sessionId={`${project?.semantic_identifier ?? projectId ?? "project"}-above-iframe`}
                  slotKey={`Above-iFrame-${project?.semantic_identifier ?? projectId ?? "project"}`}
                  placement="above-iframe"
                  variant="nav"
                />
              </div>
              <div className="flex items-center gap-0.5">
                <ToolbarTooltip label={`Connection: ${connectionStatusInfo.label}`}>
                  <div
                    className="relative flex h-7 w-7 items-center justify-center rounded-md"
                    aria-label={`Connection status: ${connectionStatusInfo.label}`}
                    role="status"
                  >
                    {connectionStatusInfo.pingClassName && (
                      <span
                        className={`absolute h-2.5 w-2.5 rounded-full ${connectionStatusInfo.pingClassName} animate-ping`}
                      />
                    )}
                    <span
                      className={`relative h-2.5 w-2.5 rounded-full ${connectionStatusInfo.dotClassName}`}
                    />
                  </div>
                </ToolbarTooltip>
                <ToolbarTooltip
                  label={
                    isRestarting
                      ? "Restarting computer…"
                      : "Restart computer"
                  }
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestartDevServer();
                    }}
                    disabled={!project || isRestarting}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={
                      isRestarting ? "Restarting computer" : "Restart computer"
                    }
                  >
                    <MonitorCog
                      className={`h-4 w-4 ${isRestarting ? "animate-pulse" : ""}`}
                      strokeWidth={1.5}
                    />
                  </button>
                </ToolbarTooltip>
                {isGodMode && (
                  <ToolbarTooltip
                    label={
                      isScreenshotUnsupported
                        ? "Screenshots unsupported (oklch CSS colors)"
                        : "Capture screenshot (admin)"
                    }
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startScreenshotCapture({
                          trigger: "manual",
                          iframe: iframeRef.current,
                          projectId,
                          autoScreenshotLimitReached,
                          setIsCapturingScreenshot,
                          screenshotTimeoutRef,
                          activeScreenshotRequestIdRef,
                          activeScreenshotTriggerRef,
                          autoScreenshotFailureCountRef,
                          setAutoScreenshotLimitReached,
                        });
                      }}
                      disabled={
                        isCapturingScreenshot ||
                        !navState.iframeSrc ||
                        !projectId ||
                        isScreenshotUnsupported
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-amber-300 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Screenshot"
                    >
                      <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </ToolbarTooltip>
                )}
                {syncStatus && (
                  <ToolbarTooltip
                    label={`Open on GitHub: ${syncStatus.repo_owner}/${syncStatus.repo_name}`}
                  >
                    <button
                      onClick={() => {
                        const url = `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}`;
                        window.open(url, "_blank");
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground"
                      aria-label="View on GitHub"
                    >
                      <Github className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </ToolbarTooltip>
                )}
                <ToolbarTooltip label="Open preview in new tab">
                  <button
                    onClick={handleOpenInNewTab}
                    disabled={!navState.iframeSrc}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </ToolbarTooltip>
              </div>
          </div>
        </TooltipProvider>
        {/* --- Static iframe, never animates or remounts unless parent navigation --- */}
        <div className="min-h-0 w-full flex-1">
          <div
            ref={iframeContainerRef}
            className={`${styles.iframeWrapper} relative h-full w-full overflow-hidden bg-card lg:rounded-lg lg:border lg:border-border lg:shadow-xl lg:shadow-black/40 ${isSelectingElement ? styles.selectingFrame : ""}`}
            suppressHydrationWarning
          >
            {(() => {
              // Debug logs
              return null;
            })()}
            {navState.iframeSrc ? (
              <iframe
                key={navState.iframeKey}
                ref={iframeRef}
                className={`${styles.scaledIframe} absolute inset-0 border-0`}
                src={navState.iframeSrc}
                title={`${activeEntryPointByPath?.page?.page_title ?? "Preview"}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                suppressHydrationWarning
                onLoad={() => setHasIframeLoaded(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-50">
                <p className="text-slate-500">No preview available.</p>
              </div>
            )}
            {/* Connection loading overlay */}
            <AnimatePresence>
              {shouldShowConnectionOverlay && (
                <motion.div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1] as const,
                  }}
                >
                  <motion.div
                    className="flex flex-col items-center gap-6"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    <Spinner3D size={36} />
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        Project connected, booting up preview…
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Spinning up your sandbox — this only takes a moment.
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!isIframeActive && navState.iframeSrc && !isSelectingElement && (
                <motion.div
                  className="absolute inset-0 z-10 flex transform-gpu cursor-pointer flex-col items-center justify-center bg-black/35 hover:bg-black/20"
                  onClick={handleOverlayClick}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1] as const,
                  }}
                  style={{ willChange: "opacity" }}
                >
                  <div className="flex items-center gap-2 rounded-xl bg-card/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur">
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-foreground"
                      aria-label="Click to test"
                    >
                      <MousePointer className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        Click to test
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInNewTab();
                      }}
                      className="flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-primary transition-colors hover:bg-primary/25"
                      aria-label="Open preview in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Open in new tab
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Small wrapper around the shared Tooltip primitives so every toolbar
 * button gets a consistent, themed tooltip without copy-pasting markup.
 */
function ToolbarTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
