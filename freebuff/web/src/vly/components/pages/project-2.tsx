"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  usePaginatedQuery,
  useQuery,
  useMutation,
  useConvexAuth,
} from "convex/react";
import { motion } from "framer-motion";
import { Loader } from "lucide-react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  useState,
  useRef,
  Suspense,
  lazy,
  useEffect,
  startTransition,
  useMemo,
} from "react";
import { useCustomer } from "autumn-js/react";
import { checkProjectWorkspaceQuota } from "@/vly/lib/billing/workspace-quota-utils";
import type { AutumnCustomer } from "@/vly/lib/billing/types";
import type { SandboxSize } from "@/vly/lib/sandbox-specs";

// Core components that are always needed
import { TopBar } from "../project-2/TopBar";
import { ChatShell } from "../project-2/ChatShell";
import { AgentChatShell } from "../project-2/agent-chat";
import { useIsMobile } from "@/vly/hooks/use-mobile";
import { ChatStorageProvider } from "@/vly/contexts/ChatStorageContext";
import { useProjectPageTheme } from "@/vly/hooks/useProjectPageTheme";
import { useIsPlatformAdmin } from "@/vly/hooks/useIsPlatformAdmin";
import { ProjectStatusDialog, ProjectStatus } from "../project-2/ProjectStatusDialog";
import {
  StarterUpgradePopup,
  useStarterUpgradePopup,
} from "@/vly/components/project-2/StarterUpgradePopup";
import {
  ProjectIframeArea,
  type IframeTab,
} from "../project-2/ProjectIframeArea";

// Lazy load heavy components that may not be immediately visible
const SyncStatusBanner = lazy(() =>
  import("../project-2/SyncStatusBanner").then((m) => ({
    default: m.SyncStatusBanner,
  })),
);
const DeploymentDialog = lazy(() =>
  import("../project-2/deployment/DeploymentDialog").then((m) => ({
    default: m.DeploymentDialog,
  })),
);
const WorkspaceInsufficientPlanModal = lazy(() =>
  import("../project-2/WorkspaceInsufficientPlanModal").then((m) => ({
    default: m.WorkspaceInsufficientPlanModal,
  })),
);

/**
 * Legacy view union — still exported because `LeftSidebar` and other
 * components import it. The new project layout only renders a subset
 * (mapped via {@link viewToTab}); legacy values like `monitoring` /
 * `hire developers` redirect to the new dedicated settings page.
 */
export type ActiveView =
  | "default"
  | "database"
  | "backend management"
  | "editor"
  | "keys"
  | "versions"
  | "integrations"
  | "ui components"
  | "assets"
  | "specification"
  | "app & support"
  | "github"
  | "monitoring"
  | "hire developers"
  | "daytona fs";

// Map old ActiveView URL params to the new IframeTab IDs used by
// ProjectIframeArea. Anything outside this map falls back to "preview".
function viewToTab(view: ActiveView): IframeTab {
  switch (view) {
    case "database":
      return "database";
    case "editor":
      return "editor";
    case "keys":
      return "keys";
    case "integrations":
      return "integrations";
    case "ui components":
      return "ui-components";
    case "backend management":
      return "logs";
    default:
      return "preview";
  }
}

function tabToView(tab: IframeTab): ActiveView {
  switch (tab) {
    case "database":
      return "database";
    case "editor":
      return "editor";
    case "keys":
      return "keys";
    case "integrations":
      return "integrations";
    case "ui-components":
      return "ui components";
    case "logs":
      return "backend management";
    case "preview":
    default:
      return "default";
  }
}

export function Project2({
  shouldShowPublicModel = false,
}: {
  shouldShowPublicModel?: boolean;
}) {
  const params = useParams();
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  // Use a wrapper component to handle the Convex query with error boundaries
  return (
    <ProjectWrapper
      semanticIdentifier={semanticIdentifier}
      shouldShowPublicModel={shouldShowPublicModel}
    />
  );
}

function ProjectPausedBanner({ projectId }: { projectId?: Id<"project"> }) {
  const userPause = useQuery(api.deployment_queries.getCurrentUserPauseStatus);
  const projectPause = useQuery(
    api.deployment_queries.getProjectPauseStatus,
    projectId ? { projectId } : "skip",
  );

  if (!userPause && !projectPause) return null;

  return (
    <div className="mx-4 mt-1.5 rounded-lg border border-red-300 bg-red-50 p-1.5 dark:border-red-700/50 dark:bg-red-950/30">
      <p className="text-[10px] leading-tight text-red-800 dark:text-red-200">
        Your project is paused due to usage limits.
      </p>
    </div>
  );
}

function ProjectWrapper({
  semanticIdentifier,
  shouldShowPublicModel = false,
}: {
  semanticIdentifier: string;
  shouldShowPublicModel?: boolean;
}) {
  const { projectTheme, toggleProjectTheme } = useProjectPageTheme();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const project = useQuery(api.project.getProjectData, { semanticIdentifier });

  // Determine which chat UI to show based on active thread type
  const useAgentChat = project?.active_agent_thread ? true : false;
  const { customer, isLoading: isCustomerLoading } = useCustomer();
  const { isPlatformAdmin, isLoading: isAdminLoading } = useIsPlatformAdmin();

  // Starter upgrade popup for free tier users
  const { showPopup: showStarterPopup, setShowPopup: setShowStarterPopup } =
    useStarterUpgradePopup();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Check migration status (for UI updates) - non-blocking
  const migrationRecord = useQuery(api.convex_instance.lookup, {
    semanticIdentifier: semanticIdentifier || undefined,
  });

  // OLD CHAT QUERIES - Only run when old chat is active to avoid conflicts
  // Fix InvalidCursor error: Only query when project has loaded to ensure stable threadId parameter
  // This prevents the parameter changing from undefined → actual_thread_id which invalidates pagination cursors
  const {
    results: threadMessages = [],
    loadMore: loadMoreThreadMessages,
    status: messagesStatus,
  } = usePaginatedQuery(
    api.project.listThreadMessages,
    !useAgentChat && project?.active_thread
      ? { semanticIdentifier, threadId: project.active_thread }
      : "skip",
    { initialNumItems: 10 },
  );

  // PERFORMANCE FIX: Filter deactivated messages client-side
  // The server no longer filters to avoid scanning thousands of documents
  // Instead we filter the paginated results here (only 10-100 messages)
  // React 19 compiler auto-memoizes this, so no useMemo needed
  const filteredThreadMessages = threadMessages.filter(
    (msg) => msg.deactivated !== true,
  );

  // OLD CHAT STREAMED MESSAGES - Only query when old chat is active
  const streamedMessages = useQuery(
    api.project.getStreamedMessages,
    !useAgentChat ? { semanticIdentifier } : "skip",
  );

  // PERFORMANCE FIX: Filter deactivated streamed messages client-side
  // (unlikely to have deactivated streaming messages, but added for consistency)
  // React 19 compiler auto-memoizes this, so no useMemo needed
  const filteredStreamedMessages = (streamedMessages || []).filter(
    (msg) => msg.deactivated !== true,
  );

  const entryPoints = useQuery(
    api.project.getEntryPoints,
    semanticIdentifier ? { semanticIdentifier } : "skip",
  );

  const syncStatus = useQuery(
    api.github.repositories.getProjectSyncStatus,
    project ? { projectId: project._id } : "skip",
  );

  // We treat the page as loading while EITHER Convex auth is still resolving
  // OR the project query itself has not landed. This prevents the "not found"
  // flash that happens when the query races ahead of auth and returns null
  // before the auth token reaches the backend. entryPoints/streamedMessages
  // are intentionally allowed to load independently.
  const isLoading = isAuthLoading || project === undefined;

  // Stable "auth has settled" flag: stays true once we observe that Convex
  // auth finished loading. We use this to delay marking a project as
  // "not-found" until after auth has had a real chance to be applied.
  const [hasAuthSettled, setHasAuthSettled] = useState(false);
  useEffect(() => {
    if (!isAuthLoading) {
      setHasAuthSettled(true);
    }
  }, [isAuthLoading]);

  // Determine project status (non-blocking)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [allowProjectCalled, setAllowProjectCalled] = useState(false);

  useEffect(() => {
    // Only check migration status after project has loaded
    if (project === undefined) return;

    // Don't even consider "not-found" until we know auth is fully settled
    // AND the user is authenticated. Otherwise a transient null from a
    // pre-auth query run would trigger the not-found dialog briefly.
    if (project === null) {
      if (hasAuthSettled && isAuthenticated) {
        setTimeout(() => setProjectStatus("not-found"), 0);
      }
      return;
    }

    // Call allow_project endpoint to trigger migration/env restoration
    // This replicates what the middleware was doing
    if (!allowProjectCalled && semanticIdentifier) {
      const checkProjectAccess = async () => {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/allow_project?projectId=${semanticIdentifier}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
            },
          );

          if (response.ok) {
            const data = await response.json();
            console.log("allow_project response:", data);
          } else {
            console.error("allow_project failed:", response.status);
          }
        } catch (error) {
          console.error("Error calling allow_project:", error);
        }
      };

      checkProjectAccess();
      // Defer state update to avoid cascading renders
      setTimeout(() => setAllowProjectCalled(true), 0);
    }

    // Check if migration is needed (only when migration check has completed)
    if (migrationRecord === undefined) {
      // Still loading migration status, don't block
      return;
    }

    if (migrationRecord === null) {
      // Migration is needed - defer to avoid cascading renders
      setTimeout(() => setProjectStatus("migrating"), 0);
      return;
    }

    // Project is accessible and migrated - defer to avoid cascading renders
    setTimeout(() => setProjectStatus(null), 0);
  }, [
    project,
    migrationRecord,
    semanticIdentifier,
    allowProjectCalled,
    hasAuthSettled,
    isAuthenticated,
  ]);

  // Auto-refresh when migration completes
  useEffect(() => {
    if (projectStatus === "migrating" && migrationRecord) {
      // Migration completed, clear the status to show the project (async to avoid setState-in-effect)
      setTimeout(() => setProjectStatus(null), 0);
    }
  }, [migrationRecord, projectStatus]);

  // Derive the initial active entry point from entryPoints
  // Use empty array fallback to handle undefined entryPoints
  const entryPointsArray = useMemo(() => entryPoints ?? [], [entryPoints]);
  const firstEntryPointId =
    entryPointsArray.length > 0 ? entryPointsArray[0]._id : null;
  const [activeEntryPoint, setActiveEntryPoint] =
    useState<Id<"entry_point"> | null>(firstEntryPointId);
  // Initialize activeView from URL params or default
  const getInitialView = (): ActiveView => {
    const viewParam = searchParams.get("view");
    if (
      viewParam &&
      [
        "default",
        "database",
        "backend management",
        "editor",
        "keys",
        "versions",
        "integrations",
        "ui components",
        "assets",
        "specification",
        "app & support",
        "github",
        "monitoring",
        "hire developers",
        "daytona fs",
      ].includes(viewParam)
    ) {
      return viewParam as ActiveView;
    }
    return "default";
  };

  const [activeView, setActiveView] = useState<ActiveView>(getInitialView);

  // Track previous view param to avoid unnecessary updates
  const prevViewParamRef = useRef<string | null>(null);

  // Update activeView when URL params change
  useEffect(() => {
    const viewParam = searchParams.get("view");

    // Only update if view param actually changed
    if (viewParam === prevViewParamRef.current) {
      return;
    }
    prevViewParamRef.current = viewParam;

    if (
      viewParam &&
      [
        "default",
        "database",
        "backend management",
        "editor",
        "keys",
        "versions",
        "integrations",
        "ui components",
        "assets",
        "specification",
        "app & support",
        "github",
        "monitoring",
        "hire developers",
        "daytona fs",
      ].includes(viewParam)
    ) {
      startTransition(() => {
        setActiveView(viewParam as ActiveView);
      });
    } else if (!viewParam) {
      startTransition(() => {
        setActiveView("default");
      });
    }
  }, [searchParams]);

  // Track previous page param to avoid unnecessary updates
  const prevPageParamRef = useRef<string | null>(null);

  // Handle activeEntryPoint from URL params
  useEffect(() => {
    const pageParam = searchParams.get("page");

    // Only update if page param actually changed
    if (pageParam === prevPageParamRef.current) {
      return;
    }
    prevPageParamRef.current = pageParam;

    if (pageParam && entryPointsArray.length > 0) {
      const entryPoint = entryPointsArray.find((ep) => ep._id === pageParam);
      if (entryPoint) {
        startTransition(() => {
          setActiveEntryPoint(entryPoint._id);
        });
        return;
      }
    }

    if (!pageParam && entryPointsArray.length > 0) {
      // If no page param is specified, use the first entry point
      startTransition(() => {
        setActiveEntryPoint(entryPointsArray[0]._id);
      });
    }
  }, [searchParams, entryPointsArray, setActiveEntryPoint]);

  const [pageIdSelectedForEdit, setPageIdSelectedForEdit] =
    useState<Id<"entry_point"> | null>(null);
  const [expandedPageNodeId] = useState<Id<"entry_point"> | null>(null);

  const [isSelectingElement, setIsSelectingElement] = useState(false);
  const [currentPageUrl, setCurrentPageUrl] = useState<string>("");
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(
    shouldShowPublicModel,
  );
  // Mobile-only "tab" state. Desktop renders chat and iframe side-by-side
  // and ignores this entirely. On mobile we swap full-screen between the
  // chat view and the preview view, with a fixed bottom tab bar.
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");

  // Whether the chat pane is in its "focused / expanded" state on desktop.
  // Triggered by focusing the chat input; collapsed by clicking the
  // "Click to test" overlay on the iframe.
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatAsideRef = useRef<HTMLElement>(null);

  // Active agent thread — used to badge the mobile Chat tab while the
  // assistant is working in the background so the user doesn't lose
  // sight of progress while they're on the Preview tab.
  const activeAgentThread = useQuery(
    api.coding_agent.cli_agent.agent_thread.getAgentThreadPublic,
    project?.active_agent_thread
      ? { threadId: project.active_agent_thread }
      : "skip",
  );
  const isChatProcessing =
    project?.state === "processing" ||
    activeAgentThread?.isProcessing === true;

  // Track whether we've revealed the iframe for the very first time on this
  // project. Brand new projects start in "processing" / "initializing" — we
  // hide the iframe until they leave that state, then fade it in and force
  // a one-shot refresh via {@link iframeRefreshKey}.
  const initialProjectStateRef = useRef<string | undefined>(undefined);
  const [hasRevealedIframe, setHasRevealedIframe] = useState(true);
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0);

  const isMobile = useIsMobile();

  // Mutation to send messages from sidebar
  const sendMessage = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  );

  // Callback to send messages from sidebar to chat
  const handleSendMessageFromSidebar = (message: string) => {
    const pageContext =
      currentPageUrl ||
      (typeof window !== "undefined" ? window.location.href : "");
    sendMessage({
      projectSemanticIdentifier: semanticIdentifier,
      message,
      agentMode: "POWERFUL",
      images: [],
      tempPageContext: pageContext,
    });
  };

  // LIFT lastNavSource ref up
  const lastNavSource = useRef<"parent" | "iframe">("parent");

  // Update URL when activeView changes
  const updateActiveView = (view: ActiveView) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    if (view === "default") {
      newSearchParams.delete("view");
    } else {
      newSearchParams.set("view", view);
    }

    const newUrl = newSearchParams.toString()
      ? `${window.location.pathname}?${newSearchParams.toString()}`
      : window.location.pathname;

    router.replace(newUrl);
    setActiveView(view);
  };

  // Update URL when activeEntryPoint changes
  const updateActiveEntryPoint = (entryPointId: Id<"entry_point">) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());

    // For the default view, include the page parameter
    if (activeView === "default") {
      newSearchParams.set("page", entryPointId);
    }

    const newUrl = newSearchParams.toString()
      ? `${window.location.pathname}?${newSearchParams.toString()}`
      : window.location.pathname;

    router.replace(newUrl);
    setActiveEntryPoint(entryPointId);
  };

  // When navigation comes from the parent UI (sidebar)
  const handleSidebarClick = (entryPointId: Id<"entry_point">) => {
    lastNavSource.current = "parent";
    updateActiveEntryPoint(entryPointId);
  };

  // If entryPoints change and activeEntryPoint is not in the list, update it
  useEffect(() => {
    if (
      entryPointsArray.length > 0 &&
      (!activeEntryPoint ||
        !entryPointsArray.some((ep) => ep._id === activeEntryPoint))
    ) {
      // Async to avoid setState-in-effect warning
      setTimeout(() => setActiveEntryPoint(entryPointsArray[0]._id), 0);
    }
  }, [entryPointsArray, activeEntryPoint]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const nextUrl = window.location.href;
      const timeoutId = window.setTimeout(() => {
        setCurrentPageUrl(nextUrl);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [searchParams]);

  // Listen for navigateToChat events from UI presets
  useEffect(() => {
    const handleNavigateToChat = () => {
      setActiveView("default");
    };

    window.addEventListener("navigateToChat", handleNavigateToChat);
    return () => {
      window.removeEventListener("navigateToChat", handleNavigateToChat);
    };
  }, []);

  // ── First-creation iframe reveal ────────────────────────────────────
  // Snapshot the very first project.state we ever see. If it was
  // "processing" or "initializing", treat this as a brand-new project and
  // keep the iframe hidden until the build finishes; then fade it in and
  // bump the refresh key to force the iframe to reload fresh content.
  useEffect(() => {
    if (project === undefined || project === null) return;
    if (initialProjectStateRef.current !== undefined) return;

    const initialState = project.state;
    initialProjectStateRef.current = initialState ?? "active";
    const looksLikeFirstBuild =
      initialState === "processing" || initialState === "initializing";
    if (looksLikeFirstBuild) {
      setHasRevealedIframe(false);
    }
  }, [project]);

  useEffect(() => {
    if (hasRevealedIframe) return;
    if (project === undefined || project === null) return;
    const state = project.state;
    if (state !== "processing" && state !== "initializing") {
      setHasRevealedIframe(true);
      // Refresh iframe once the build settles so it picks up the new server.
      setIframeRefreshKey((k) => k + 1);
    }
  }, [hasRevealedIframe, project]);

  // ── Chat expand / collapse via explicit, intentional triggers ───────
  // Per design feedback we no longer auto-expand on any pointerdown in the
  // chat and no longer auto-collapse on outside clicks. The two triggers
  // are now:
  //   • EXPAND  → user focuses the chat input/textarea (focusin event
  //     bubbles out of <textarea>/<input> inside the chat aside).
  //   • COLLAPSE → user clicks the "Click to test" overlay on the iframe
  //     (wired via the onClickToTest callback into ProjectIframeArea).
  useEffect(() => {
    if (isMobile) return;
    const aside = chatAsideRef.current;
    if (!aside) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Only expand when the focus lands on an actual input control
      // (textarea or text input). Buttons, dropdowns, links, etc. are
      // intentionally ignored so the chat keeps its compact shape.
      const tag = target.tagName;
      const isTextInput =
        tag === "TEXTAREA" ||
        (tag === "INPUT" &&
          (target as HTMLInputElement).type !== "file" &&
          (target as HTMLInputElement).type !== "button" &&
          (target as HTMLInputElement).type !== "checkbox") ||
        target.isContentEditable === true;
      if (isTextInput) {
        setIsChatExpanded(true);
      }
    };

    aside.addEventListener("focusin", handleFocusIn);
    return () => {
      aside.removeEventListener("focusin", handleFocusIn);
    };
  }, [isMobile, project?._id]);

  // Show a single, polished loading screen while either auth is resolving or
  // the project query hasn't returned yet. We intentionally use the SAME
  // screen for both states so users never see a flash of empty/not-found
  // before auth completes.
  if (isLoading) {
    return <ProjectLoadingScreen />;
  }

  // After auth + project query have both settled, if the project is still
  // missing we either keep waiting (auth not authenticated → middleware will
  // redirect to /login shortly) or surface the not-found dialog.
  if (!project) {
    if (!hasAuthSettled || !isAuthenticated) {
      return <ProjectLoadingScreen />;
    }
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background font-sans">
          <main className="flex flex-1 flex-col items-center justify-center bg-background p-4" />
        </div>
        <ProjectStatusDialog
          status={projectStatus}
          semanticIdentifier={semanticIdentifier}
        />
      </>
    );
  }

  // Check workspace quota using Autumn's check function
  const workspaceSize = (project.sandbox_size || "small") as SandboxSize;
  const quotaCheck = checkProjectWorkspaceQuota(
    project,
    customer as AutumnCustomer | null | undefined,
  );

  // Handler for workspace downgrade from blocking modal
  const handleWorkspaceDowngrade = async () => {
    // This will be handled by the WorkspaceInsufficientPlanModal component
    // which will trigger migration through the existing migration flow
    // For now, we'll need to redirect to monitoring page or trigger migration
    window.location.href = `/web/project/${semanticIdentifier}?view=monitoring`;
  };

  // If workspace is blocked, show blocking modal instead of project
  // Don't block while customer data is still loading from Autumn
  if (
    !quotaCheck.allowed &&
    !isCustomerLoading &&
    !isAdminLoading &&
    !isPlatformAdmin
  ) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background font-sans">
          <main className="flex flex-1 flex-col items-center justify-center bg-background p-4" />
        </div>
        <Suspense fallback={<div />}>
          <WorkspaceInsufficientPlanModal
            open={true}
            projectName={project.name || "Untitled Project"}
            currentWorkspaceSize={workspaceSize}
            customer={customer as AutumnCustomer | null | undefined}
            onDowngrade={handleWorkspaceDowngrade}
          />
        </Suspense>
      </>
    );
  }

  // Bridge the legacy ActiveView URL state with the new IframeTab API of
  // ProjectIframeArea (handles round-trip back to URL via updateActiveView).
  const activeTab: IframeTab = viewToTab(activeView);
  const setActiveTab = (tab: IframeTab) => updateActiveView(tabToView(tab));

  return (
    <>
      {/* Deployment Dialog - triggered by publish URL param */}
      <Suspense fallback={<div />}>
        <DeploymentDialog
          isOpen={showDeploymentDialog}
          onOpenChange={setShowDeploymentDialog}
          projectId={project._id}
          settingsHref={`/web/project/${semanticIdentifier}/settings?section=deployments`}
        />
      </Suspense>

      <div className="project-page-root fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background">
        {/* Top bar — hidden on the mobile Preview tab so the iframe gets
            the full screen. Chat tab still shows it for project context. */}
        {(!isMobile || mobileView === "chat") && (
          <div className="relative z-50 flex-shrink-0">
            <TopBar
              project={project}
              projectTheme={projectTheme}
              onToggleProjectTheme={toggleProjectTheme}
            />
          </div>
        )}

        {/* Sync banner sits just under the top bar */}
        {(!isMobile || mobileView === "chat") && (
          <Suspense fallback={null}>
            <SyncStatusBanner syncStatus={syncStatus} activeView={activeView} />
          </Suspense>
        )}

        {/* Main split: chat left | iframe area right (desktop).
            On mobile we render both stacked and toggle visibility with
            display:none so neither view loses internal state when the
            user flips between Chat and Preview tabs. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── Chat ──────────────────────────────────────────────────── */}
          <motion.aside
            ref={chatAsideRef}
            initial={false}
            animate={
              isMobile
                ? undefined
                : isChatExpanded
                  ? { width: "58%" }
                  : { width: "42%" }
            }
            transition={{
              duration: 0.42,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-background ${
              isMobile
                ? `w-full ${mobileView === "chat" ? "flex" : "hidden"}`
                : "min-w-[400px] max-w-[820px]"
            }`}
            style={isMobile ? undefined : { willChange: "width" }}
          >
            {/* Floating chat toolbar — hidden on mobile (those actions
                live in the project dropdown instead, to keep the chat
                surface uncluttered for small screens). */}
            {!isMobile && (
              <ChatTopActions
                semanticIdentifier={semanticIdentifier}
                projectId={project._id}
                syncStatus={syncStatus}
              />
            )}

            <ChatStorageProvider
              projectSemanticIdentifier={semanticIdentifier}
            >
              {project === undefined ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Loading project…
                </div>
              ) : useAgentChat ? (
                <AgentChatShell
                  project={project}
                  projectSemanticIdentifier={semanticIdentifier}
                  onSwitchToOldChat={undefined}
                  isSelectingElement={isSelectingElement}
                  setIsSelectingElement={setIsSelectingElement}
                />
              ) : (
                <ChatShell
                  project={project}
                  threadMessages={filteredThreadMessages}
                  messagesStatus={
                    messagesStatus === "LoadingFirstPage"
                      ? undefined
                      : messagesStatus
                  }
                  loadMoreThreadMessages={loadMoreThreadMessages}
                  streamedMessages={filteredStreamedMessages}
                  pageIdSelectedForEdit={pageIdSelectedForEdit}
                  onPageSelectedForEdit={setPageIdSelectedForEdit}
                  expandedPageNodeId={expandedPageNodeId}
                  projectSemanticIdentifier={semanticIdentifier}
                  createNewThreadFromEntryPoint={async () => {}}
                  isSelectingElement={isSelectingElement}
                  setIsSelectingElement={setIsSelectingElement}
                  currentPageUrl={currentPageUrl}
                  syncStatus={syncStatus}
                  activeEntryPointId={activeEntryPoint}
                  onSwitchToNewAgent={undefined}
                />
              )}
            </ChatStorageProvider>
          </motion.aside>

          {/* ── Iframe area ──────────────────────────────────────────── */}
          <section
            className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${
              isMobile && mobileView !== "preview" ? "hidden" : ""
            }`}
          >
            <ProjectIframeArea
              project={project}
              semanticIdentifier={semanticIdentifier}
              entryPointsArray={entryPointsArray}
              activeEntryPoint={activeEntryPoint}
              isSelectingElement={isSelectingElement}
              onCurrentPageChange={setCurrentPageUrl}
              syncStatus={syncStatus}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isRevealed={hasRevealedIframe}
              isChatExpanded={!isMobile && isChatExpanded}
              refreshTrigger={iframeRefreshKey}
              onClickToTest={() => {
                if (!isMobile) setIsChatExpanded(false);
              }}
              hideTabs={isMobile}
              openInNewTab={() => {
                const url =
                  project?.pretty_preview_url ?? project?.preview_url ?? "";
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }}
            />
          </section>
        </div>

        {/* ── Mobile bottom tab bar ──────────────────────────────────── */}
        {isMobile && (
          <MobileTabBar
            view={mobileView}
            onChange={setMobileView}
            isChatProcessing={isChatProcessing}
          />
        )}
      </div>

      {/* Project Status Dialog - shown as overlay when migration or errors detected */}
      <ProjectStatusDialog
        status={projectStatus}
        semanticIdentifier={semanticIdentifier}
      />

      {/* Starter Upgrade Popup for free tier users */}
      <StarterUpgradePopup
        open={showStarterPopup}
        onOpenChange={setShowStarterPopup}
      />
    </>
  );
}

/**
 * Shared loading screen for every "we don't have the project yet" state:
 * auth resolving, project query in-flight, or auth landed but query still
 * re-running. Renders flush with the app theme so the user never sees a
 * blank or "not found" flash on their way to the editor.
 */
function ProjectLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background">
      <img
        src="/logo-icon.png"
        alt="Freebuff"
        className="h-9 w-9 animate-pulse object-contain opacity-90"
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader className="h-3.5 w-3.5 animate-spin text-primary" />
        <span>Loading project…</span>
      </div>
    </div>
  );
}

/**
 * Tiny floating toolbar overlaid on the top-right of the chat pane.
 * Provides quick access to version history and GitHub sync — both lazily
 * surfaced so we don't perturb the (very large) underlying ChatShell.
 */
function ChatTopActions({
  semanticIdentifier,
  projectId,
  syncStatus,
}: {
  semanticIdentifier: string;
  projectId: Id<"project">;
  syncStatus?: import("convex/server").FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >;
}) {
  const router = useRouter();
  void projectId;
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-30 flex gap-0.5">
      <button
        onClick={() => {
          if (syncStatus) {
            window.open(
              `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}/commits`,
              "_blank",
              "noopener,noreferrer",
            );
          } else {
            router.push(
              `/web/project/${semanticIdentifier}/settings?section=github`,
            );
          }
        }}
        title={
          syncStatus
            ? "Version history (open commits on GitHub)"
            : "Connect GitHub to view version history"
        }
        aria-label="Version history"
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      <button
        onClick={() => {
          if (syncStatus) {
            window.open(
              `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}`,
              "_blank",
              "noopener,noreferrer",
            );
          } else {
            router.push(
              `/web/project/${semanticIdentifier}/settings?section=github`,
            );
          }
        }}
        title={syncStatus ? "View on GitHub" : "Connect GitHub"}
        aria-label="GitHub"
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="currentColor"
        >
          <path d="M12 .5C5.4.5 0 5.9 0 12.5c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.3-.1-.3-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 3 .1 3.3.8.9 1.3 2 1.3 3.3 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.9 18.6.5 12 .5z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Fixed bottom tab bar shown only on mobile. Large icon-first tap targets
 * (Lovable-style) for switching between Chat and Preview. The Chat tab
 * shows a pulsing dot when the agent is processing so the user always
 * knows there's work in flight, even while they're testing the preview.
 */
function MobileTabBar({
  view,
  onChange,
  isChatProcessing,
}: {
  view: "chat" | "preview";
  onChange: (next: "chat" | "preview") => void;
  isChatProcessing: boolean;
}) {
  return (
    <nav
      className="relative z-40 flex flex-shrink-0 items-stretch justify-around gap-1 bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur-xl"
      aria-label="Project navigation"
    >
      <MobileTabButton
        active={view === "chat"}
        onClick={() => onChange("chat")}
        label="Chat"
        showDot={isChatProcessing && view !== "chat"}
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        }
      />
      <MobileTabButton
        active={view === "preview"}
        onClick={() => onChange("preview")}
        label="Preview"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 18v3" />
          </svg>
        }
      />
    </nav>
  );
}

function MobileTabButton({
  active,
  onClick,
  label,
  icon,
  showDot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  showDot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors ${
        active
          ? "bg-muted/70 text-foreground"
          : "text-foreground/65 hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      {showDot && (
        <span
          className="absolute right-[28%] top-1.5 flex h-2 w-2 items-center justify-center"
          aria-hidden="true"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
