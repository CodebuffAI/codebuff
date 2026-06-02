/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

//TODO: implement in new version!!
export function OnboardingTour({ project, user }: { project: any; user: any }) {
  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingActive, setOnboardingActive] = useState(true);
  const [sidebarRect, setSidebarRect] = useState<DOMRect | null>(null);
  const [tourStarted, setTourStarted] = useState(false);
  const [maskDims, setMaskDims] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // Convex mutation to set onboarding_completed
  const setOnboardingCompleted = useMutation(api.users.setOnboardingCompleted);

  // If user has completed onboarding, never show the tour
  useEffect(() => {
    if (user && user.onboarding_completed) {
      setOnboardingActive(false);
    }
  }, [user]);

  // All hooks must be called unconditionally
  // Refs for el/rect
  const elRef = useRef<HTMLElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  const onboardingSteps = [
    {
      id: "onboarding-intro",
      message:
        "Welcome to your project! This tour will walk you through the main parts of the interface.",
      isIntro: true,
    },
    {
      id: "onboarding-navbar",
      message:
        "This is the navbar. Here you can deploy your app, invite members, configure env variables, and more. Try it out!",
    },
    {
      id: "onboarding-translation",
      message:
        "This is the translation panel. You can use this to view a translation of your codebase into English, making it easier to understand and navigate your project.",
    },
    {
      id: "onboarding-dock",
      message:
        "Look through the dock below. You can add pages and features and access help.",
    },
    {
      id: "onboarding-chat",
      message:
        "Iterate on your project using the chat. Close it with the X button (top left). You can also read through its steps, expand its code, and swap conversations.",
    },
    // The page node step will be handled dynamically
  ];

  // Helper to get the onboarding step info, including dynamic page node
  const getCurrentOnboardingStep = () => {
    if (onboardingStep < onboardingSteps.length) {
      // Attach demo GIFs to static steps
      const step = onboardingSteps[onboardingStep];
      if (step.id === "onboarding-navbar") {
        return { ...step, demoGif: "/sidebar-demo.gif" };
      }
      if (step.id === "onboarding-dock") {
        return { ...step, demoGif: "/dockbar-demo.gif" };
      }
      if (step.id === "onboarding-chat") {
        return { ...step, demoGif: "/chat-demo.gif" };
      }
      return step;
    }
    // After the static steps, highlight the first page node if it exists
    if (
      project &&
      Array.isArray(project.entryPoints) &&
      project.entryPoints.length > 0
    ) {
      const firstPageNodeId = project.entryPoints[0]._id;
      if (onboardingStep === onboardingSteps.length) {
        return {
          id: `onboarding-page-node-${firstPageNodeId}`,
          message:
            "This is the figma-like canvas where you can zoom & pan around to view your app pages. Click on a page to test the app.",
          demoGif: "/canvas-demo.gif",
        };
      }
      // If there is a second page node, add a step for it
      if (
        project.entryPoints.length > 1 &&
        onboardingStep === onboardingSteps.length + 1
      ) {
        const secondPageNodeId = project.entryPoints[1]._id;
        return {
          id: `onboarding-page-node-${secondPageNodeId}`,
          message:
            "Some pages require you to be signed in (otherwise it will be hidden). Click on the page and sign in with email to test your protected pages.",
          demoGif: "/auth-demo.gif",
          isLast: true,
        };
      }
    }
    // If no more steps, just finish
    return null;
  };

  const isOnboardingShowing =
    onboardingActive &&
    !!getCurrentOnboardingStep() &&
    !(user && user.onboarding_completed);

  // Helper to get the actual element to highlight (may need to traverse up for dock/page node)
  function getHighlightElement(stepId: string): HTMLElement | null {
    const el = document.getElementById(stepId);
    if (!el) return null;
    // For dock, try to get the closest parent with a fixed/absolute position
    if (stepId === "onboarding-dock") {
      let parent = el;
      while (parent && parent !== document.body) {
        const pos = window.getComputedStyle(parent).position;
        if (["fixed", "absolute", "sticky"].includes(pos))
          return parent as HTMLElement;
        parent = parent.parentElement!;
      }
    }
    // For page node, try to get the outer node container (ReactFlow node)
    if (stepId.startsWith("onboarding-page-node-")) {
      // Traverse up to .react-flow__node or the first element with data-id
      let parent = el;
      while (parent && parent !== document.body) {
        if (
          parent.classList.contains("react-flow__node") ||
          parent.hasAttribute("data-id")
        ) {
          return parent as HTMLElement;
        }
        parent = parent.parentElement!;
      }
    }
    // For sidebar, ensure the sidebar container is highlighted (cut out the whole sidebar)
    if (stepId === "onboarding-navbar") {
      // If the sidebar is nested, get the outer sidebar container
      let parent = el;
      while (parent && parent !== document.body) {
        if (parent.classList.contains("border-r")) return parent as HTMLElement;
        parent = parent.parentElement!;
      }
    }
    // For translation panel, just return the element by id
    if (stepId === "onboarding-translation") {
      return el;
    }
    return el;
  }

  // Always update elRef and rectRef on every render
  const step = getCurrentOnboardingStep();
  useEffect(() => {
    if (!isOnboardingShowing || !step) {
      elRef.current = null;
      rectRef.current = null;
      return;
    }
    const el = getHighlightElement(step.id);
    elRef.current = el;
    rectRef.current = el ? el.getBoundingClientRect() : null;
  }, [isOnboardingShowing, step]);

  useLayoutEffect(() => {
    // Only run sidebar rect logic if tour has started and step is sidebar
    if (!isOnboardingShowing || !tourStarted) return;
    if (!step || step.id !== "onboarding-navbar") return;
    let el = getHighlightElement(step.id);
    if (!el) return;
    // Traverse up to the sidebar's outer container
    let parent = el;
    while (parent && parent !== document.body) {
      if (parent.classList.contains("border-r")) {
        el = parent as HTMLElement;
        break;
      }
      parent = parent.parentElement!;
    }
    // Wait for sidebar to be visible and have non-zero size
    const updateRect = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        // Only update if onboardingStep is for sidebar and value is different
        let shouldUpdate = onboardingStep === 1;
        if (shouldUpdate && sidebarRect) {
          shouldUpdate = !(
            sidebarRect.top === rect.top &&
            sidebarRect.left === rect.left &&
            sidebarRect.width === rect.width &&
            sidebarRect.height === rect.height
          );
        }
        if (shouldUpdate) {
          setSidebarRect(rect);
        }
      } else {
        setTimeout(updateRect, 50);
      }
    };
    updateRect();
    // Scroll into view after visible
    setTimeout(
      () => el.scrollIntoView({ block: "center", behavior: "smooth" }),
      400,
    );
  }, [isOnboardingShowing, onboardingStep, tourStarted, step]);

  // Reset sidebarRect when tour restarts
  useEffect(() => {
    if (!tourStarted) setSidebarRect(null);
  }, [tourStarted]);

  // State to track the current rect for positioning calculations
  const [currentRect, setCurrentRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Update currentRect from ref whenever step changes
    setCurrentRect(rectRef.current);
  }, [step, isOnboardingShowing]);

  useEffect(() => {
    if (!currentRect) return;
    const newDims = {
      top: currentRect.top - 8,
      left: currentRect.left - 8,
      width: currentRect.width + 16,
      height: currentRect.height + 16,
    };
    // Only update if different
    if (
      !maskDims ||
      maskDims.top !== newDims.top ||
      maskDims.left !== newDims.left ||
      maskDims.width !== newDims.width ||
      maskDims.height !== newDims.height
    ) {
      setMaskDims(newDims);
    }
  }, [currentRect, maskDims]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onResize = () => {
      const r = el.getBoundingClientRect();
      setCurrentRect(r);
      setMaskDims({
        top: r.top - 8,
        left: r.left - 8,
        width: r.width + 16,
        height: r.height + 16,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step, isOnboardingShowing]);

  // State for animated card position
  const [cardPos, setCardPos] = useState({
    top: window.innerHeight * 0.4,
    left: window.innerWidth / 2,
    transform: "translate(-50%, 0)",
  });

  // Animate highlight border
  const [highlightStyle, setHighlightStyle] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  // Calculate target card position inside useEffect to avoid ref access during render
  useEffect(() => {
    const rect = currentRect;
    const cardWidth = 400;
    const cardHeight = 220;
    const minMargin = 24;

    let targetTop = window.innerHeight * 0.4;
    let targetLeft = window.innerWidth / 2;
    let targetTransform = "translate(-50%, 0)";

    // Special positioning for sidebar step: center card vertically next to sidebar
    if (rect && step && step.id === "onboarding-navbar") {
      targetTop = rect.top + rect.height / 2 - cardHeight / 2;
      targetLeft = rect.right + 32;
      targetTransform = "translateY(0)";
      if (targetTop < minMargin) targetTop = minMargin;
      if (targetTop + cardHeight > window.innerHeight - minMargin)
        targetTop = window.innerHeight - cardHeight - minMargin;
      if (targetLeft + cardWidth > window.innerWidth - minMargin)
        targetLeft = window.innerWidth - cardWidth - minMargin;
    } else if (rect && step && step.id === "onboarding-dock") {
      targetTop = rect.top - cardHeight - 200;
      if (targetTop < minMargin) targetTop = minMargin;
      targetLeft = rect.left;
      targetTransform = "translateY(0)";
      if (targetLeft + cardWidth > window.innerWidth - minMargin)
        targetLeft = window.innerWidth - cardWidth - minMargin;
      if (targetLeft < minMargin) targetLeft = minMargin;
    } else if (rect && step && step.id.startsWith("onboarding-page-node-")) {
      const isAuthNode = (step as any).isLast;
      targetTop = rect.top + rect.height / 2 - cardHeight / 2;
      if (isAuthNode) {
        targetLeft = rect.left - cardWidth - 32;
      } else {
        targetLeft = rect.right + 32;
      }
      targetTransform = "translateY(0)";
      if (targetTop < minMargin) targetTop = minMargin;
      if (targetTop + cardHeight > window.innerHeight - minMargin)
        targetTop = window.innerHeight - cardHeight - minMargin;
      if (targetLeft + cardWidth > window.innerWidth - minMargin)
        targetLeft = window.innerWidth - cardWidth - minMargin;
      if (targetLeft < minMargin) targetLeft = minMargin;
    } else if (rect) {
      const centerLeft = window.innerWidth / 2 - cardWidth / 2;
      if (
        Math.abs(rect.left - centerLeft) > 80 &&
        centerLeft > minMargin &&
        centerLeft + cardWidth < window.innerWidth - minMargin
      ) {
        targetLeft = centerLeft;
        targetTransform = "translateY(0)";
      } else {
        targetLeft = rect.left;
        targetTransform = "translateX(0)";
      }
      const centerTop = window.innerHeight / 2 - cardHeight / 2;
      if (
        Math.abs(rect.top - centerTop) > 80 &&
        centerTop > minMargin &&
        centerTop + cardHeight < window.innerHeight - minMargin
      ) {
        targetTop = centerTop;
      } else {
        targetTop = rect.bottom + 24;
      }
      if (targetLeft + cardWidth > window.innerWidth - minMargin)
        targetLeft = window.innerWidth - cardWidth - minMargin;
      if (targetLeft < minMargin) targetLeft = minMargin;
      if (targetTop + cardHeight > window.innerHeight - minMargin)
        targetTop = window.innerHeight - cardHeight - minMargin;
      if (targetTop < minMargin) targetTop = minMargin;
    }

    setCardPos({
      top: targetTop,
      left: targetLeft,
      transform: targetTransform,
    });

    // Update highlight style
    if (rect) {
      setHighlightStyle({
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
      });
    }
  }, [currentRect, step]);

  // SVG mask for cutout
  const Mask = () => {
    if (!maskDims) return null;
    return (
      <svg
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "auto",
          zIndex: 99998,
        }}
        width={window.innerWidth}
        height={window.innerHeight}
      >
        <defs>
          <mask id="onboarding-cutout">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={maskDims.left}
              y={maskDims.top}
              width={maskDims.width}
              height={maskDims.height}
              rx={12}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#onboarding-cutout)"
        />
      </svg>
    );
  };

  // Onboarding overlay component
  if (!isOnboardingShowing) return null;
  if (!step) return null;
  // Show intro screen
  if (typeof (step as any).isIntro === "boolean" && (step as any).isIntro) {
    return createPortal(
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.7)",
          zIndex: 99998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "#fff",
            color: "#222",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: 32,
            minWidth: 340,
            maxWidth: 420,
            fontSize: 20,
            fontWeight: 500,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            alignItems: "center",
          }}
        >
          <div>{step.message}</div>
          <button
            style={{
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "12px 32px",
              fontSize: 18,
              cursor: "pointer",
              marginTop: 12,
            }}
            onClick={() => {
              setTourStarted(true);
              setOnboardingStep(1);
            }}
          >
            Begin Tour
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      <Mask />
      {/* Highlighted border (no background) */}
      {currentRect && (
        <div
          style={{
            position: "fixed",
            top: highlightStyle.top,
            left: highlightStyle.left,
            width: highlightStyle.width,
            height: highlightStyle.height,
            border: "3px solid #fff",
            borderRadius: 12,
            boxShadow: "0 0 0 4px rgba(255,255,255,0.5)",
            zIndex: 100000,
            pointerEvents: "none",
            background: "none",
            transition:
              "top 0.35s cubic-bezier(0.33,1,0.68,1), left 0.35s cubic-bezier(0.33,1,0.68,1), width 0.35s cubic-bezier(0.33,1,0.68,1), height 0.35s cubic-bezier(0.33,1,0.68,1)",
            willChange: "top, left, width, height",
          }}
        />
      )}
      {/* Card with message - always on top */}
      <div
        style={{
          position: "fixed",
          top: cardPos.top,
          left: cardPos.left,
          transform: cardPos.transform,
          zIndex: 100002,
          background: "#fff",
          color: "#222",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: 24,
          minWidth: 320,
          maxWidth: 400,
          fontSize: 18,
          fontWeight: 500,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
          transition:
            "top 0.35s cubic-bezier(0.33,1,0.68,1), left 0.35s cubic-bezier(0.33,1,0.68,1), transform 0.35s cubic-bezier(0.33,1,0.68,1)",
          willChange: "top, left, transform",
        }}
      >
        {typeof (step as any).demoGif === "string" && (
          <img
            src={(step as any).demoGif}
            alt="Demo"
            style={{
              width: "100%",
              maxWidth: 340,
              borderRadius: 8,
              marginBottom: 12,
              boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
            }}
          />
        )}
        <div>{step.message}</div>
        {"isLast" in step && step.isLast ? (
          <button
            style={{
              alignSelf: "flex-end",
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
            onClick={async () => {
              setOnboardingActive(false);
              try {
                await setOnboardingCompleted({});
              } catch {
                // ignore error
              }
            }}
          >
            Finish
          </button>
        ) : (
          <button
            style={{
              alignSelf: "flex-end",
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
            onClick={() => setOnboardingStep((s) => s + 1)}
          >
            Next
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
