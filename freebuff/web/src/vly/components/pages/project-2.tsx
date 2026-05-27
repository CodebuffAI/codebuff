"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Loader, MessageCircle } from "lucide-react";
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

  // Only show loading if project is loading
  // entryPoints and streamedMessages can load independently
  const isLoading = project === undefined;

  // Determine project status (non-blocking)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(
    null,
  );
  const [allowProjectCalled, setAllowProjectCalled] = useState(false);

  useEffect(() => {
    // Only check migration status after project has loaded
    if (project === undefined) return;

    // Check if project exists
    if (project === null) {
      // Async to avoid setState-in-effect warning
      setTimeout(() => setProjectStatus("not-found"), 0);
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
  }, [project, migrationRecord, semanticIdentifier, allowProjectCalled]);

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
  const [isChatVisible, setIsChatVisible] = useState(true);

  // Whether the chat pane is in its "focused / expanded" state. Clicking
  // inside the chat expands it; clicking outside collapses it back.
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatAsideRef = useRef<HTMLElement>(null);

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

  // ── Chat expand / collapse on focus ────────────────────────────────
  // Listen at the document level so any click outside the chat aside
  // collapses it back. Pointerdown beats click for snappy UX.
  useEffect(() => {
    if (!isChatExpanded) return;
    const handlePointerDown = (event: PointerEvent) => {
      const aside = chatAsideRef.current;
      if (!aside) return;
      const target = event.target as Node | null;
      if (target && !aside.contains(target)) {
        setIsChatExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isChatExpanded]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background font-sans">
        <main className="flex flex-1 flex-col items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-4">
            <Loader className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading project…
            </p>
          </div>
        </main>
      </div>
    );
  }

  // This should not happen given our checks above, but TypeScript guard
  // If project doesn't exist, show minimal UI with the dialog overlay
  if (!project) {
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
        />
      </Suspense>

      <div className="project-page-root flex h-screen flex-col overflow-hidden bg-background">
        {/* Top bar (compact Lovable-style) */}
        <div className="relative z-50 flex-shrink-0">
          <TopBar
            project={project}
            projectTheme={projectTheme}
            onToggleProjectTheme={toggleProjectTheme}
          />
        </div>

        {/* Sync banner sits just under the top bar */}
        <Suspense fallback={null}>
          <SyncStatusBanner syncStatus={syncStatus} activeView={activeView} />
        </Suspense>

        {/* Main split: chat left | iframe area right.
            On desktop, the widths animate when the chat is "focused" so the
            chat grows and the iframe compacts; clicking anywhere outside the
            chat aside collapses back to default proportions. */}
        <div className="flex min-h-0 flex-1">
          {/* ── Chat (left) ───────────────────────────────────────────── */}
          <motion.aside
            ref={chatAsideRef}
            onPointerDown={() => {
              if (!isMobile) setIsChatExpanded(true);
            }}
            initial={false}
            animate={
              isMobile
                ? undefined
                : isChatExpanded
                  ? { width: "62%" }
                  : { width: "44%" }
            }
            transition={{
              duration: 0.42,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className={`relative flex h-full flex-col border-r border-border/60 bg-card/40 ${
              isMobile
                ? `absolute inset-y-0 left-0 z-40 w-full max-w-[480px] transform transition-transform ${
                    isChatVisible ? "translate-x-0" : "-translate-x-full"
                  }`
                : "min-w-[420px] max-w-[820px]"
            }`}
            style={isMobile ? undefined : { willChange: "width" }}
          >
            {/* Floating chat toolbar (version history + GitHub sync) */}
            <ChatTopActions
              semanticIdentifier={semanticIdentifier}
              projectId={project._id}
              syncStatus={syncStatus}
            />

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

          {/* ── Iframe area (right) ──────────────────────────────────── */}
          <section className="relative min-w-0 flex-1">
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
            />
          </section>
        </div>

        {/* Mobile chat toggle */}
        {isMobile && (
          <div className="flex-shrink-0 border-t border-border/60 bg-background/95 px-2 py-1.5 backdrop-blur">
            <button
              onClick={() => setIsChatVisible(!isChatVisible)}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" />
              {isChatVisible ? "Hide chat" : "Show chat"}
            </button>
          </div>
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
        onClick={() =>
          router.push(`/web/project/${semanticIdentifier}?view=versions`)
        }
        title="Version history"
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
            );
          } else {
            router.push(`/web/project/${semanticIdentifier}?view=github`);
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
