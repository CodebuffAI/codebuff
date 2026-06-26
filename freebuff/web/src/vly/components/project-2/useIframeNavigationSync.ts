import { useEffect, useState, useMemo } from "react";
import { FunctionReturnType } from "convex/server";
import { Id } from "@/convex/_generated/dataModel";
import { getExternalPreviewUrl } from "@/vly/lib/project-preview-url";

export interface UseIframeNavigationSyncProps {
  project: FunctionReturnType<any> | null;
  entryPoints: any[];
  activeEntryPoint: any;
  setActiveEntryPoint: (id: Id<"entry_point"> | null) => void;
}

export function useIframeNavigationSync({
  project,
  entryPoints,
  activeEntryPoint,
  setActiveEntryPoint,
}: UseIframeNavigationSyncProps) {
  const finalUrl = useMemo(() => {
    if (!project) {
      return null;
    }

    const baseUrl = getExternalPreviewUrl(project);
    if (!baseUrl) {
      return null;
    }

    // Connected-repo projects can have a live preview URL before any entry
    // points exist. Fall back to the root preview URL in that case.
    if (
      activeEntryPoint?.page?.page_display_url === null ||
      activeEntryPoint?.page?.page_display_url === undefined
    ) {
      try {
        return new URL("/", baseUrl).href;
      } catch {
        return null;
      }
    }

    try {
      return new URL(activeEntryPoint.page.page_display_url, baseUrl).href;
    } catch {
      return null;
    }
  }, [project, activeEntryPoint]);
  const urlObj = useMemo(
    () => (finalUrl ? new URL(finalUrl) : null),
    [finalUrl],
  );
  const urlHost = urlObj?.host;
  const urlProtocol = urlObj?.protocol;
  const baseUrl = urlObj ? `${urlProtocol}//${urlHost}` : "";
  const initialPath = urlObj?.pathname || "/";
  const initialUrl = urlObj ? urlObj.href : undefined;

  // Navigation state
  const [navState, setNavState] = useState<{
    stack: string[];
    index: number;
    iframeSrc: string | undefined;
    iframeKey: number;
    lastNavSource: "parent" | "iframe";
  }>({
    stack: initialPath ? [initialPath] : [],
    index: 0,
    iframeSrc: initialUrl,
    iframeKey: 0,
    lastNavSource: "parent",
  });

  // When initialUrl becomes available AFTER mount (e.g. a connected-repo dev
  // server saves preview_url to the DB after starting up), update iframeSrc if
  // it's still empty. This is needed because useState only reads the initial
  // value once — if preview_url was null at mount time the iframe would never
  // get a src even after the URL is persisted and the project query updates.
  useEffect(() => {
    if (!initialUrl) return;
    setNavState((prev) => {
      if (prev.iframeSrc) return prev; // already set, don't override
      return {
        stack: [initialPath || "/"],
        index: 0,
        iframeSrc: initialUrl,
        iframeKey: prev.iframeKey + 1,
        lastNavSource: "parent",
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  // On parent navigation (entry point change), reset stack, iframe src, and iframeKey
  // Uses stable id comparison to avoid remounting when only object reference changes (e.g. re-fetch)
  const [prevEntryPointId, setPrevEntryPointId] = useState(
    activeEntryPoint?._id ?? null,
  );
  const currentEntryPointId = activeEntryPoint?._id ?? null;
  if (prevEntryPointId !== currentEntryPointId) {
    setPrevEntryPointId(currentEntryPointId);
    if (initialPath && initialUrl) {
      setNavState((prev) => ({
        stack: [initialPath],
        index: 0,
        iframeSrc: initialUrl,
        iframeKey: prev.iframeKey + 1,
        lastNavSource: "parent",
      }));
    }
  }

  // Normalize paths so that '' and '/' are treated as equivalent
  const normalizePath = (p?: string | null) =>
    p === "" || p === undefined || p === null ? "/" : p;

  // Listen for route changes from iframe (iframe-originated navigation)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!urlObj || event.origin !== urlObj.origin) return;
      if (
        event.data &&
        event.data.type === "iframe-route-change" &&
        typeof event.data.path === "string"
      ) {
        const newPath = normalizePath(event.data.path);
        setNavState((prev) => {
          const { stack, index } = prev;
          if (stack[index] === newPath) {
            return { ...prev, lastNavSource: "iframe" };
          }
          const existingIdx = stack.indexOf(newPath);
          let newStack, newIndex;
          if (existingIdx !== -1) {
            newStack = stack;
            newIndex = existingIdx;
          } else {
            newStack = [...stack.slice(0, index + 1), newPath];
            newIndex = newStack.length - 1;
          }
          return {
            stack: newStack,
            index: newIndex,
            iframeSrc: prev.iframeSrc, // Do not update src
            iframeKey: prev.iframeKey, // Do not update key
            lastNavSource: "iframe",
          };
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [urlObj, baseUrl]);

  // Navigation handlers
  const canGoBack = navState.index > 0;
  const canGoForward = navState.index < navState.stack.length - 1;

  const handleBack = () => {
    if (canGoBack) {
      setNavState((prev) => {
        const newIndex = prev.index - 1;
        const newPath = prev.stack[newIndex];
        return {
          ...prev,
          index: newIndex,
          iframeSrc: baseUrl ? new URL(newPath, baseUrl).href : prev.iframeSrc,
          iframeKey: Date.now(),
          lastNavSource: "parent",
        };
      });
    }
  };
  const handleForward = () => {
    if (canGoForward) {
      setNavState((prev) => {
        const newIndex = prev.index + 1;
        const newPath = prev.stack[newIndex];
        return {
          ...prev,
          index: newIndex,
          iframeSrc: baseUrl ? new URL(newPath, baseUrl).href : prev.iframeSrc,
          iframeKey: Date.now(),
          lastNavSource: "parent",
        };
      });
    }
  };

  // Sidebar navigation handler
  const handleSidebarNavigation = (entryPointId: Id<"entry_point">) => {
    // Find the entry point and update parent state
    const entryPoint = entryPoints.find((ep) => ep._id === entryPointId);
    if (!entryPoint) return;
    setActiveEntryPoint(entryPointId);
    // The effect above will handle resetting navState
  };

  // Calculate current path and active entry point by path
  const currentPath = navState.stack[navState.index];
  const activeEntryPointByPath =
    entryPoints && currentPath
      ? entryPoints.find(
          (ep) =>
            normalizePath(ep.page?.page_display_url) ===
            normalizePath(currentPath),
        ) || activeEntryPoint
      : activeEntryPoint;

  return {
    navState,
    canGoBack,
    canGoForward,
    handleBack,
    handleForward,
    handleSidebarNavigation,
    activeEntryPointByPath,
    baseUrl,
  };
}
