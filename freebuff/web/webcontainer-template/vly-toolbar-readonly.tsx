// DO NOT MODIFY THIS FILE. THIS FILE IS READ-ONLY. CONTAINS ALL KEY APP FUNCTIONALITY.

import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MousePointer, ExternalLink, AlertTriangle } from "lucide-react";

import { snapdom } from "@zumer/snapdom";

// FiberNode and ComponentInfo interfaces
export interface FiberNode {
  displayName?: string;
  name?: string;
  tag: number;
  type: unknown;
  return: FiberNode | null;
  _debugOwner?: {
    name: string;
    env: string;
  };
}

const FunctionComponent = 0;
const ClassComponent = 1;
const HostComponent = 5;

export interface ComponentInfo {
  name: string;
  type: "regular" | "rsc";
}

export function getReactComponentHierarchy(
  element: HTMLElement | null,
): ComponentInfo[] | null {
  if (!element) {
    return null;
  }

  const components: ComponentInfo[] = [];
  const maxComponents = 3;

  // Find the internal React Fiber node key.
  const fiberKey = Object.keys(element).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$"),
  );

  if (!fiberKey) {
    return null;
  }

  let currentFiber: FiberNode | null = (
    element as unknown as Record<string, unknown>
  )[fiberKey] as FiberNode | null;

  if (!currentFiber) {
    return null;
  }

  // Traverse up the Fiber tree.
  while (currentFiber && components.length < maxComponents) {
    let componentData: ComponentInfo | null = null;

    if (
      currentFiber.tag === ClassComponent ||
      currentFiber.tag === FunctionComponent
    ) {
      const componentDefinition = currentFiber.type;
      if (componentDefinition) {
        const def = componentDefinition as {
          displayName?: string;
          name?: string;
        };
        const name =
          def.displayName ||
          def.name ||
          currentFiber._debugOwner?.name ||
          "AnonymousComponent";
        componentData = { name, type: "regular" };
      }
    } else if (
      currentFiber.tag === HostComponent &&
      currentFiber._debugOwner &&
      currentFiber._debugOwner.env?.toLowerCase().includes("server")
    ) {
      componentData = { name: currentFiber._debugOwner.name, type: "rsc" };
    }

    if (componentData) {
      const alreadyExists = components.some(
        (c) => c.name === componentData!.name && c.type === componentData!.type,
      );
      if (!alreadyExists) {
        components.push(componentData);
      }
    }
    currentFiber = currentFiber.return;
  }

  return components.length > 0 ? components : null;
}

export function formatReactComponentHierarchy(
  hierarchy: ComponentInfo[] | null,
): string {
  if (!hierarchy || hierarchy.length === 0) {
    return "No React components found for this element.";
  }

  const parts = hierarchy.map(
    (info) => `{name: ${info.name}, type: ${info.type}}`,
  );

  let description = `React component tree (from closest to farthest, ${hierarchy.length} closest element${hierarchy.length > 1 ? "s" : ""}): `;
  description += parts.join(" child of ");

  return description;
}

export function getSelectedElementAnnotation(element: HTMLElement) {
  const hierarchy = getReactComponentHierarchy(element);
  if (hierarchy?.[0]) {
    return {
      annotation: `${hierarchy[0].name}${hierarchy[0].type === "rsc" ? " (RSC)" : ""}`,
    };
  }
  return { annotation: null };
}

export function getSelectedElementsPrompt(elements: HTMLElement[]) {
  const selectedComponentHierarchies = elements.map((e) =>
    getReactComponentHierarchy(e),
  );

  if (selectedComponentHierarchies.some((h) => h && h.length > 0)) {
    const content = `This is additional information on the elements that the user selected. Use this information to find the correct element in the codebase.

  ${selectedComponentHierarchies.map((h, index) => {
    return `
<element index="${index + 1}">
  ${!h || h.length === 0 ? "No React component as parent detected" : `React component tree (from closest to farthest, 3 closest elements): ${h.map((c) => `{name: ${c.name}, type: ${c.type}}`).join(" child of ")}`}
</element>
    `;
  })}
  `;

    return content;
  }

  return null;
}

const HIGHLIGHT_CLASS = "vly-toolbar-highlight";

// Add highlight style to the document
const injectHighlightStyle = () => {
  if (document.getElementById("vly-toolbar-style")) return;
  const style = document.createElement("style");
  style.id = "vly-toolbar-style";
  style.innerHTML = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #0070f3;
      cursor: pointer;
      background: rgba(0,112,243,0.08);
    }
  `;
  document.head.appendChild(style);
};

function getDomSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    return (
      el.tagName.toLowerCase() + "." + el.className.trim().replace(/\s+/g, ".")
    );
  }
  return el.tagName.toLowerCase();
}

const Overlay: React.FC<{
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (el: HTMLElement) => void;
  onHover: (el: HTMLElement) => void;
  onUnhover: () => void;
  selectMode: boolean;
}> = ({ toolbarRef, onSelect, onHover, onUnhover, selectMode }) => {
  const lastHovered = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectMode) return;
      const overlay = e.currentTarget;
      overlay.style.pointerEvents = "none";
      const el = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;
      overlay.style.pointerEvents = "auto";

      // Build ignore list from toolbar ref
      const shouldIgnore = el && toolbarRef.current && (el === toolbarRef.current || toolbarRef.current.contains(el));
      if (!el || shouldIgnore) return;

      if (lastHovered.current !== el) {
        if (lastHovered.current)
          lastHovered.current.classList.remove(HIGHLIGHT_CLASS);
        lastHovered.current = el;
        el.classList.add(HIGHLIGHT_CLASS);
        onHover(el);
      }
    },
    [toolbarRef, onHover, selectMode],
  );

  const handleMouseLeave = useCallback(() => {
    if (!selectMode) return;
    if (lastHovered.current) {
      lastHovered.current.classList.remove(HIGHLIGHT_CLASS);
      lastHovered.current = null;
    }
    onUnhover();
  }, [onUnhover, selectMode]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const overlay = e.currentTarget;
      overlay.style.pointerEvents = "none";
      const el = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;
      overlay.style.pointerEvents = "auto";

      // Build ignore list from toolbar ref
      const shouldIgnore = el && toolbarRef.current && (el === toolbarRef.current || toolbarRef.current.contains(el));
      if (!el || shouldIgnore) return;

      if (lastHovered.current)
        lastHovered.current.classList.remove(HIGHLIGHT_CLASS);
      onSelect(el);
    },
    [toolbarRef, onSelect],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        cursor: "copy",
        pointerEvents: "auto",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      tabIndex={0}
      role="button"
    />
  );
};

export const VlyToolbar: React.FC = () => {
  const [selectMode, setSelectMode] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [showDevOverlay, setShowDevOverlay] = React.useState(true);

  const isDevDeployment =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".vly.sh") &&
    window.self === window.top;

  React.useEffect(() => {
    injectHighlightStyle();
  }, []);

  // Listen for postMessage from parent to enable/disable select mode
  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data && event.data.type === "vly-toolbar-enable-select") {
        setSelectMode(true);
      }
      if (event.data && event.data.type === "vly-toolbar-disable-select") {
        setSelectMode(false);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Callbacks for overlay
  const handleSelect = useCallback(async (el: HTMLElement) => {
    setSelectMode(false);
    const selector = getDomSelector(el);
    const hierarchy = getReactComponentHierarchy(el);
    const formatted = formatReactComponentHierarchy(hierarchy);

    let imageDataUrl: string | undefined = undefined;
    try {
      // Optionally, preload resources for best results
      // await preCache(el);
      const canvas = await snapdom.toCanvas(el, { fast: true });
      imageDataUrl = canvas.toDataURL("image/png");
    } catch (e) {
      console.error("Failed to snapshot element", e);
    }

    window.parent.postMessage(
      {
        type: "vly-toolbar-select",
        selector,
        reactHierarchy: hierarchy,
        reactHierarchyFormatted: formatted,
        image: imageDataUrl,
      },
      "*",
    );
  }, []);

  const handleHover = useCallback(() => {
    // Optionally do something on hover
  }, []);

  const handleUnhover = useCallback(() => {
    // Optionally do something on unhover
  }, []);

  // Get project name for redirect URL
  const getProjectName = () => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      // Extract project name from hostname (e.g., "projectname.vly.sh")
      const match = hostname.match(/^([^.]+)\.vly\.sh$/);
      return match ? match[1] : "unknown";
    }
    return "unknown";
  };

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showDevOverlay) {
        setShowDevOverlay(false);
      }
    };
    
    if (showDevOverlay) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDevOverlay]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only dismiss if clicking the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
      setShowDevOverlay(false);
    }
  };

  const handleContinue = () => {
    setShowDevOverlay(false);
  };

  const handleGoToProject = () => {
    const projectName = getProjectName();
    window.location.href = `https://freebuff.com/project/${projectName}?publish=true`;
  };

  return (
    <>
      { isDevDeployment && showDevOverlay && (
        <div
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-env-label"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <AnimatePresence>
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{
                position: "relative",
                cursor: "default",
              }}
            >
              <div className="flex items-center gap-3 rounded-lg border border-white/30 bg-white/95 px-4 py-3 shadow-lg">
                <div className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/95">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span 
                      id="dev-env-label"
                      className="text-sm font-medium text-gray-700"
                      title="Development deployment - should not be shared publicly. Use 'Go to project' to create a production version."
                    >
                      This is a testing environment. Share only your published project.
                    </span>
                  </div>
                </div>
                <div className="h-6 w-px bg-gray-300"></div>
                <button
                  onClick={handleContinue}
                  className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/95"
                >
                  <MousePointer className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    Click to test
                  </span>
                </button>
                <div className="h-6 w-px bg-gray-300"></div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGoToProject();
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/95"
                >
                  <ExternalLink className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    Publish Project
                  </span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      {selectMode && (
        <Overlay
          toolbarRef={toolbarRef}
          onSelect={handleSelect}
          onHover={handleHover}
          onUnhover={handleUnhover}
          selectMode={selectMode}
        />
      )}
      {/* Hide toolbar if there are no buttons or controls to show */}
      {/* If toolbar has no children, render nothing */}
      {/* <div ref={toolbarRef} ... /> is now hidden if empty */}
      {/* If you add controls in the future, restore this div */}
    </>
  );
};

export default VlyToolbar;
