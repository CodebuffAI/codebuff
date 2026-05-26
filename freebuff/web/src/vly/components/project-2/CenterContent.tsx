import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ExternalLink,
  MousePointer,
  RotateCcw,
  RotateCw,
  Github,
  Camera,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useIframeNavigationSync } from "./useIframeNavigationSync";
import { useIsMobile } from "@/vly/hooks/use-mobile";
import { Spinner3D } from "./Spinner3D";
import styles from "./CenterContent.module.css";
import { useProjectConnection } from "@/vly/hooks/useProjectConnection";
import { toast } from "sonner";
import { useSignedInUser } from "@/vly/hooks/use-user";

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
}

type ScreenshotTrigger = "auto" | "manual";

const MAX_AUTO_SCREENSHOT_FAILURES = 3;

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

  console.log("[Screenshot] Capturing project:", projectId);
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
  }, [navState.iframeKey, navState.iframeSrc]);

  const handleRefresh = React.useCallback(() => {
    const iframe = iframeRef.current;
    const currentPath = navState.stack[navState.index];
    if (iframe && baseUrl && currentPath) {
      // Refresh the current page the user is viewing, not the original URL
      const currentUrl = new URL(currentPath, baseUrl);
      // Skip _refresh for vly.sh (pretty preview) - it breaks styles. Only use for dev preview URLs.
      if (!baseUrl.includes("vly.sh")) {
        currentUrl.searchParams.set("_refresh", Date.now().toString());
      }
      iframe.src = currentUrl.toString();
    }
  }, [baseUrl, navState.index, navState.stack]);

  // Use React Query for automatic project connection
  // React Query handles deduplication and prevents duplicate requests automatically
  const { isConnecting, checkProjectConnection } = useProjectConnection({
    semanticIdentifier: project?.semantic_identifier,
    onSuccess: () => {
      // Force refresh the iframe content after successful connection (dev preview only).
      // Skip for vly.sh - any programmatic reload breaks styles (initial load works, reload doesn't).
      if (project?.pretty_preview_url?.includes("vly.sh")) return;
      setTimeout(() => {
        handleRefresh();
      }, 1000); // Small delay to ensure connection is fully established
    },
  });

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

        // Refresh iframe after changes are applied so preview keeps up with edits.
        if (result.success) {
          setTimeout(() => {
            handleRefresh();
          }, 1000);
        }
      } finally {
        isPostApplyConnectionCheckRunningRef.current = false;
      }
    })();
  }, [
    project?.state,
    project?.semantic_identifier,
    checkProjectConnection,
    handleRefresh,
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

  // Overlay click logic
  const handleOverlayClick = () => {
    setIsIframeActive(true);
  };

  const handleOpenInNewTab = () => {
    if (navState.iframeSrc) {
      window.open(navState.iframeSrc, "_blank", "noopener,noreferrer");
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
        console.log("[Screenshot] Received message:", {
          type,
          requestId,
          hasDataUrl: !!dataUrl,
          error,
        });
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

      console.log("[Screenshot] Processing response...");
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
        console.log("[Screenshot] Converting base64 to blob...");
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
        console.log("[Screenshot] Uploading to R2 via HTTP endpoint...");
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
      <div className="flex min-h-screen items-center justify-center p-4">
        <p>Select a page to view its content.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-4 pt-2" suppressHydrationWarning>
      <div className="inline-flex w-full flex-col items-start justify-start gap-2">
        <div className="inline-flex w-full items-center justify-between">
          <div className="justify-start text-sm font-semibold leading-none text-stone-500">
            {activeEntryPointByPath?.page?.page_title ?? "Untitled Page"}
          </div>
        </div>
        {/* --- Minimal Navigator --- */}
        <div
          className="mb-2 flex w-full min-w-[220px] items-center gap-1 rounded-full border border-slate-100/60 bg-white/60 px-2 py-0.5 shadow-sm backdrop-blur-sm dark:border-[#444444] dark:bg-[#282828] dark:shadow-[0_8px_22px_-14px_rgba(0,0,0,0.92)]"
          style={{ minHeight: 28 }}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={handleBack}
              disabled={!canGoBack}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.04] transition hover:bg-slate-200/60 active:bg-slate-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
              style={{ fontSize: 16 }}
              aria-label="Back"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 13L5 8L10 3"
                  stroke="#888"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={handleForward}
              disabled={!canGoForward}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.04] transition hover:bg-slate-200/60 active:bg-slate-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
              style={{ fontSize: 16 }}
              aria-label="Forward"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 13L11 8L6 3"
                  stroke="#888"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
              disabled={!navState.iframeSrc}
              className="flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-1 transition hover:bg-slate-200/60 active:bg-slate-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
              aria-label="Refresh"
            >
              <RotateCw
                className="h-3 w-3 text-zinc-800 dark:text-zinc-200"
                strokeWidth={1.5}
              />
              <span className="text-[10px] text-gray-600 dark:text-zinc-300">
                Refresh
              </span>
            </button>
          </div>
          <span
            className="flex-1 select-text truncate px-2 font-mono text-[11px] text-gray-500 dark:text-zinc-400"
            style={{ letterSpacing: 0.2 }}
          >
            {navState.stack[navState.index] || (
              <span className="opacity-40">/</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRestartDevServer();
              }}
              disabled={!project || isRestarting}
              className="flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-1 transition hover:bg-slate-200/60 active:bg-slate-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
              aria-label="Restart Server"
            >
              <RotateCcw
                className={`h-3 w-3 text-zinc-800 dark:text-zinc-200 ${isRestarting ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              <span className="text-[10px] text-gray-600 dark:text-zinc-300">
                {isRestarting ? "Restarting..." : "Broken? Restart Server"}
              </span>
            </button>
            {isGodMode && (
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
                className="flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 transition hover:bg-yellow-200 active:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#5a4e33] dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
                aria-label="Screenshot (God Mode)"
                title={
                  isScreenshotUnsupported
                    ? "Screenshots not supported: This app uses oklch() CSS colors"
                    : "Admin only: Capture screenshot"
                }
              >
                <Camera
                  className="h-3 w-3 text-zinc-800 dark:text-[#d6be86]"
                  strokeWidth={1.5}
                />
                <span className="text-[10px] text-gray-600 dark:text-[#d6be86]">
                  {isCapturingScreenshot
                    ? "Capturing..."
                    : isScreenshotUnsupported
                      ? "❌ Not Supported"
                      : "📸 Screenshot"}
                </span>
              </button>
            )}
            {syncStatus && (
              <button
                onClick={() => {
                  const url = `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}`;
                  window.open(url, "_blank");
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.04] transition hover:bg-slate-200/60 active:bg-slate-300/70 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
                style={{ fontSize: 16 }}
                aria-label="View on GitHub"
                title={`View on GitHub: ${syncStatus.repo_owner}/${syncStatus.repo_name}`}
              >
                <Github
                  className="h-4 w-4 text-zinc-800 dark:text-zinc-200"
                  strokeWidth={1.5}
                />
              </button>
            )}
            <button
              onClick={handleOpenInNewTab}
              disabled={!navState.iframeSrc}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.04] transition hover:bg-slate-200/60 active:bg-slate-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#282828] dark:hover:bg-[#3c3c3c] dark:active:bg-[#3c3c3c]"
              style={{ fontSize: 16 }}
              aria-label="Open in new tab"
            >
              <ExternalLink
                className="h-4 w-4 text-zinc-800 dark:text-zinc-200"
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>
        {/* --- End Navigator --- */}
        {/* --- Static iframe, never animates or remounts unless parent navigation --- */}
        <div className="w-full">
          <div
            ref={iframeContainerRef}
            className={`${styles.iframeWrapper} relative w-full overflow-hidden rounded-sm bg-white shadow-[0_4px_30px_0_rgba(45,45,45,0.2)] dark:bg-[#282828] dark:shadow-[0_10px_30px_0_rgba(0,0,0,0.72)] ${isSelectingElement ? styles.selectingFrame : ""} ${isMobile ? "aspect-[9/16]" : "aspect-[982/567]"}`}
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
                onLoad={() => {}}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-50">
                <p className="text-slate-500">No preview available.</p>
              </div>
            )}
            {/* Connection loading overlay */}
            <AnimatePresence>
              {isConnecting && (
                <motion.div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm"
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
                      <p className="text-sm font-medium text-zinc-700">
                        Starting sandbox...
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        This may take a moment
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!isIframeActive && navState.iframeSrc && !isSelectingElement && (
                <motion.div
                  className="absolute inset-0 z-10 flex transform-gpu cursor-pointer flex-col items-center justify-center bg-black/10 hover:bg-black/5"
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
                  <div className="flex items-center gap-3 rounded-lg border border-white/30 bg-white/95 px-4 py-3 shadow-lg">
                    <div className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/95">
                      <MousePointer className="h-4 w-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Click to test
                      </span>
                    </div>
                    <div className="h-6 w-px bg-gray-300"></div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInNewTab();
                      }}
                      className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/95"
                    >
                      <ExternalLink className="h-4 w-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Open in new tab
                      </span>
                    </button>
                  </div>
                  <p className="mt-3 text-center text-xs text-gray-500">
                    Project may take a moment to load <br /> Publish your
                    project for faster speeds.
                  </p>
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] text-amber-600">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Styles may be off in the preview — open in new tab instead.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* --- Animated documentation/editor section --- */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeEntryPointByPath?._id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] as const }}
            className="w-full pt-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="justify-start text-sm font-semibold leading-none text-stone-500">
                Documentation (currently under maintence)
              </div>
            </div>
            <div className="w-full rounded-lg bg-white/60 pb-8 pl-12 pr-8 pt-12 text-sm outline outline-1 outline-offset-[-1px] outline-gray-300/80">
              <p className="font-medium text-stone-600">
                Documentation is currently under maintence
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
