'use client'

import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { usePaginatedQuery, useQuery, useMutation } from 'convex/react'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader, MessageCircle } from 'lucide-react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  useState,
  useRef,
  Suspense,
  lazy,
  useEffect,
  startTransition,
  useMemo,
} from 'react'
import { useCustomer } from 'autumn-js/react'
import { checkProjectWorkspaceQuota } from '@/vly/lib/billing/workspace-quota-utils'
import type { AutumnCustomer } from '@/vly/lib/billing/types'
import type { SandboxSize } from '@/vly/lib/sandbox-specs'

// Core components that are always needed
import { TopBar } from '../project-2/TopBar'
import { ChatShell } from '../project-2/ChatShell'
import { AgentChatShell } from '../project-2/agent-chat'
import { useIsMobile } from '@/vly/hooks/use-mobile'
import { MarkdownWithSuggest } from '../project-2/MarkdownWithSuggest'
import { ChatStorageProvider } from '@/vly/contexts/ChatStorageContext'
import { useProjectPageTheme } from '@/vly/hooks/useProjectPageTheme'
import {
  ProjectStatusDialog,
  ProjectStatus,
} from '../project-2/ProjectStatusDialog'
import { PausedDeploymentBanner } from '@/vly/components/common/paused-deployment-banner'
import {
  FeatureGate,
  UpgradePrompt,
} from '@/vly/components/billing/FeatureGate'
import {
  StarterUpgradePopup,
  useStarterUpgradePopup,
} from '@/vly/components/project-2/StarterUpgradePopup'
import { GravityAdSlot } from '@/vly/components/project-2/agent-chat/GravityAdSlot'

// Lazy load heavy components that may not be immediately visible
const CenterContent = lazy(() =>
  import('../project-2/CenterContent').then((m) => ({
    default: m.CenterContent,
  })),
)
const LeftSidebar = lazy(() =>
  import('../project-2/LeftSidebar').then((m) => ({ default: m.LeftSidebar })),
)
const SyncStatusBanner = lazy(() =>
  import('../project-2/SyncStatusBanner').then((m) => ({
    default: m.SyncStatusBanner,
  })),
)
const DeploymentDialog = lazy(() =>
  import('../project-2/deployment/DeploymentDialog').then((m) => ({
    default: m.DeploymentDialog,
  })),
)
const DatabaseView = lazy(() => import('../project-2/DatabaseView'))
const WorkspaceInsufficientPlanModal = lazy(() =>
  import('../project-2/WorkspaceInsufficientPlanModal').then((m) => ({
    default: m.WorkspaceInsufficientPlanModal,
  })),
)

export type ActiveView =
  | 'default'
  | 'database'
  | 'backend management'
  | 'editor'
  | 'keys'
  | 'versions'
  | 'integrations'
  | 'ui components'
  | 'assets'
  | 'specification'
  | 'app & support'
  | 'github'
  | 'monitoring'
  | 'hire developers'
  | 'daytona fs'

// Direct import for lightweight components

// Lazy load heavier components
const EnvVarsView = lazy(() => import('../project-2/EnvVarsView'))
const GitCommitsView = lazy(() => import('../project-2/GitCommitsView'))
const IntegrationsView = lazy(() => import('../project-2/IntegrationsView'))
const UiIntegrationView = lazy(() => import('../project-2/UiIntegrationView'))
const AssetsView = lazy(() => import('../project-2/AssetsView'))
const GitHubSyncView = lazy(() => import('../project-2/GitHubSyncView'))
const EditorView = lazy(() => import('../project-2/EditorView'))
const AppAndSupportView = lazy(() => import('../project-2/AppAndSupportView'))
const BackendManagement = lazy(() => import('../project-2/BackendManagement'))
const Monitoring = lazy(() => import('../project-2/Monitoring'))
const HireDevelopersView = lazy(() => import('../project-2/HireDevelopersView'))
const DaytonaFSDashboard = lazy(() => import('../project-2/DaytonaFSDashboard'))

export function Project2({
  shouldShowPublicModel = false,
}: {
  shouldShowPublicModel?: boolean
}) {
  const params = useParams()
  const semanticIdentifier = typeof params.id === 'string' ? params.id : ''

  // Use a wrapper component to handle the Convex query with error boundaries
  return (
    <ProjectWrapper
      semanticIdentifier={semanticIdentifier}
      shouldShowPublicModel={shouldShowPublicModel}
    />
  )
}

function ProjectWrapper({
  semanticIdentifier,
  shouldShowPublicModel = false,
}: {
  semanticIdentifier: string
  shouldShowPublicModel?: boolean
}) {
  const { projectTheme, toggleProjectTheme } = useProjectPageTheme()
  const project = useQuery(api.project.getProjectData, { semanticIdentifier })

  // Determine which chat UI to show based on active thread type
  const useAgentChat = project?.active_agent_thread ? true : false
  const { customer, isLoading: isCustomerLoading } = useCustomer()

  // Starter upgrade popup for free tier users
  const { showPopup: showStarterPopup, setShowPopup: setShowStarterPopup } =
    useStarterUpgradePopup()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Check migration status (for UI updates) - non-blocking
  const migrationRecord = useQuery(api.convex_instance.lookup, {
    semanticIdentifier: semanticIdentifier || undefined,
  })

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
      : 'skip',
    { initialNumItems: 10 },
  )

  // PERFORMANCE FIX: Filter deactivated messages client-side
  // The server no longer filters to avoid scanning thousands of documents
  // Instead we filter the paginated results here (only 10-100 messages)
  // React 19 compiler auto-memoizes this, so no useMemo needed
  const filteredThreadMessages = threadMessages.filter(
    (msg) => msg.deactivated !== true,
  )

  // OLD CHAT STREAMED MESSAGES - Only query when old chat is active
  const streamedMessages = useQuery(
    api.project.getStreamedMessages,
    !useAgentChat ? { semanticIdentifier } : 'skip',
  )

  // PERFORMANCE FIX: Filter deactivated streamed messages client-side
  // (unlikely to have deactivated streaming messages, but added for consistency)
  // React 19 compiler auto-memoizes this, so no useMemo needed
  const filteredStreamedMessages = (streamedMessages || []).filter(
    (msg) => msg.deactivated !== true,
  )

  const entryPoints = useQuery(
    api.project.getEntryPoints,
    semanticIdentifier ? { semanticIdentifier } : 'skip',
  )

  const syncStatus = useQuery(
    api.github.repositories.getProjectSyncStatus,
    project ? { projectId: project._id } : 'skip',
  )

  // Only show loading if project is loading
  // entryPoints and streamedMessages can load independently
  const isLoading = project === undefined

  // Determine project status (non-blocking)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null)
  const [allowProjectCalled, setAllowProjectCalled] = useState(false)

  useEffect(() => {
    // Only check migration status after project has loaded
    if (project === undefined) return

    // Check if project exists
    if (project === null) {
      // Async to avoid setState-in-effect warning
      setTimeout(() => setProjectStatus('not-found'), 0)
      return
    }

    // Call allow_project endpoint to trigger migration/env restoration
    // This replicates what the middleware was doing
    if (!allowProjectCalled && semanticIdentifier) {
      const checkProjectAccess = async () => {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/allow_project?projectId=${semanticIdentifier}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
            },
          )

          if (response.ok) {
            const data = await response.json()
            console.log('allow_project response:', data)
          } else {
            console.error('allow_project failed:', response.status)
          }
        } catch (error) {
          console.error('Error calling allow_project:', error)
        }
      }

      checkProjectAccess()
      // Defer state update to avoid cascading renders
      setTimeout(() => setAllowProjectCalled(true), 0)
    }

    // Check if migration is needed (only when migration check has completed)
    if (migrationRecord === undefined) {
      // Still loading migration status, don't block
      return
    }

    if (migrationRecord === null) {
      // Migration is needed - defer to avoid cascading renders
      setTimeout(() => setProjectStatus('migrating'), 0)
      return
    }

    // Project is accessible and migrated - defer to avoid cascading renders
    setTimeout(() => setProjectStatus(null), 0)
  }, [project, migrationRecord, semanticIdentifier, allowProjectCalled])

  // Auto-refresh when migration completes
  useEffect(() => {
    if (projectStatus === 'migrating' && migrationRecord) {
      // Migration completed, clear the status to show the project (async to avoid setState-in-effect)
      setTimeout(() => setProjectStatus(null), 0)
    }
  }, [migrationRecord, projectStatus])

  // Derive the initial active entry point from entryPoints
  // Use empty array fallback to handle undefined entryPoints
  const entryPointsArray = useMemo(() => entryPoints ?? [], [entryPoints])
  const firstEntryPointId =
    entryPointsArray.length > 0 ? entryPointsArray[0]._id : null
  const [activeEntryPoint, setActiveEntryPoint] =
    useState<Id<'entry_point'> | null>(firstEntryPointId)
  // Initialize activeView from URL params or default
  const getInitialView = (): ActiveView => {
    const viewParam = searchParams.get('view')
    if (
      viewParam &&
      [
        'default',
        'database',
        'backend management',
        'editor',
        'keys',
        'versions',
        'integrations',
        'ui components',
        'assets',
        'specification',
        'app & support',
        'github',
        'monitoring',
        'hire developers',
        'daytona fs',
      ].includes(viewParam)
    ) {
      return viewParam as ActiveView
    }
    return 'default'
  }

  const [activeView, setActiveView] = useState<ActiveView>(getInitialView)

  // Track previous view param to avoid unnecessary updates
  const prevViewParamRef = useRef<string | null>(null)

  // Update activeView when URL params change
  useEffect(() => {
    const viewParam = searchParams.get('view')

    // Only update if view param actually changed
    if (viewParam === prevViewParamRef.current) {
      return
    }
    prevViewParamRef.current = viewParam

    if (
      viewParam &&
      [
        'default',
        'database',
        'backend management',
        'editor',
        'keys',
        'versions',
        'integrations',
        'ui components',
        'assets',
        'specification',
        'app & support',
        'github',
        'monitoring',
        'hire developers',
        'daytona fs',
      ].includes(viewParam)
    ) {
      startTransition(() => {
        setActiveView(viewParam as ActiveView)
      })
    } else if (!viewParam) {
      startTransition(() => {
        setActiveView('default')
      })
    }
  }, [searchParams])

  // Track previous page param to avoid unnecessary updates
  const prevPageParamRef = useRef<string | null>(null)

  // Handle activeEntryPoint from URL params
  useEffect(() => {
    const pageParam = searchParams.get('page')

    // Only update if page param actually changed
    if (pageParam === prevPageParamRef.current) {
      return
    }
    prevPageParamRef.current = pageParam

    if (pageParam && entryPointsArray.length > 0) {
      const entryPoint = entryPointsArray.find((ep) => ep._id === pageParam)
      if (entryPoint) {
        startTransition(() => {
          setActiveEntryPoint(entryPoint._id)
        })
        return
      }
    }

    if (!pageParam && entryPointsArray.length > 0) {
      // If no page param is specified, use the first entry point
      startTransition(() => {
        setActiveEntryPoint(entryPointsArray[0]._id)
      })
    }
  }, [searchParams, entryPointsArray, setActiveEntryPoint])

  const [pageIdSelectedForEdit, setPageIdSelectedForEdit] =
    useState<Id<'entry_point'> | null>(null)
  const [expandedPageNodeId] = useState<Id<'entry_point'> | null>(null)

  const [isSelectingElement, setIsSelectingElement] = useState(false)
  const [currentPageUrl, setCurrentPageUrl] = useState<string>('')
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(
    shouldShowPublicModel,
  )
  const [isChatVisible, setIsChatVisible] = useState(true)
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const isMobile = useIsMobile()

  // Mutation to send messages from sidebar
  const sendMessage = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  )

  // Callback to send messages from sidebar to chat
  const handleSendMessageFromSidebar = (message: string) => {
    const pageContext =
      currentPageUrl ||
      (typeof window !== 'undefined' ? window.location.href : '')
    sendMessage({
      projectSemanticIdentifier: semanticIdentifier,
      message,
      agentMode: 'POWERFUL',
      images: [],
      tempPageContext: pageContext,
    })
  }

  // LIFT lastNavSource ref up
  const lastNavSource = useRef<'parent' | 'iframe'>('parent')

  // Update URL when activeView changes
  const updateActiveView = (view: ActiveView) => {
    const newSearchParams = new URLSearchParams(searchParams.toString())
    if (view === 'default') {
      newSearchParams.delete('view')
    } else {
      newSearchParams.set('view', view)
    }

    const newUrl = newSearchParams.toString()
      ? `${window.location.pathname}?${newSearchParams.toString()}`
      : window.location.pathname

    router.replace(newUrl)
    setActiveView(view)
  }

  // Update URL when activeEntryPoint changes
  const updateActiveEntryPoint = (entryPointId: Id<'entry_point'>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString())

    // For the default view, include the page parameter
    if (activeView === 'default') {
      newSearchParams.set('page', entryPointId)
    }

    const newUrl = newSearchParams.toString()
      ? `${window.location.pathname}?${newSearchParams.toString()}`
      : window.location.pathname

    router.replace(newUrl)
    setActiveEntryPoint(entryPointId)
  }

  // When navigation comes from the parent UI (sidebar)
  const handleSidebarClick = (entryPointId: Id<'entry_point'>) => {
    lastNavSource.current = 'parent'
    updateActiveEntryPoint(entryPointId)
  }

  // If entryPoints change and activeEntryPoint is not in the list, update it
  useEffect(() => {
    if (
      entryPointsArray.length > 0 &&
      (!activeEntryPoint ||
        !entryPointsArray.some((ep) => ep._id === activeEntryPoint))
    ) {
      // Async to avoid setState-in-effect warning
      setTimeout(() => setActiveEntryPoint(entryPointsArray[0]._id), 0)
    }
  }, [entryPointsArray, activeEntryPoint])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const nextUrl = window.location.href
      const timeoutId = window.setTimeout(() => {
        setCurrentPageUrl(nextUrl)
      }, 0)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [searchParams])

  // Listen for navigateToChat events from UI presets
  useEffect(() => {
    const handleNavigateToChat = () => {
      setActiveView('default')
    }

    window.addEventListener('navigateToChat', handleNavigateToChat)
    return () => {
      window.removeEventListener('navigateToChat', handleNavigateToChat)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background font-sans">
        <main className="flex flex-1 flex-col items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader className="h-6 w-6 animate-spin" />
            </div>
            <p className="">Loading project...</p>
          </div>
          <motion.div
            className="fixed inset-0 z-0 transform-gpu"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.5, ease: [0, 0, 0.2, 1] as const }}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Safeguard the <img> tag */}
            {project && (
              <img
                src="/hero.webp"
                alt="Background"
                className="h-full w-full object-cover opacity-10"
              />
            )}
          </motion.div>
        </main>
      </div>
    )
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
    )
  }

  // Check workspace quota using Autumn's check function
  const workspaceSize = (project.sandbox_size || 'small') as SandboxSize
  const quotaCheck = checkProjectWorkspaceQuota(
    project,
    customer as AutumnCustomer | null | undefined,
  )

  // Handler for workspace downgrade from blocking modal
  const handleWorkspaceDowngrade = async () => {
    // This will be handled by the WorkspaceInsufficientPlanModal component
    // which will trigger migration through the existing migration flow
    // For now, we'll need to redirect to monitoring page or trigger migration
    window.location.href = `/web/project/${semanticIdentifier}?view=monitoring`
  }

  // If workspace is blocked, show blocking modal instead of project
  // Don't block while customer data is still loading from Autumn
  if (!quotaCheck.allowed && !isCustomerLoading) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background font-sans">
          <main className="flex flex-1 flex-col items-center justify-center bg-background p-4" />
        </div>
        <Suspense fallback={<div />}>
          <WorkspaceInsufficientPlanModal
            open={true}
            projectName={project.name || 'Untitled Project'}
            currentWorkspaceSize={workspaceSize}
            customer={customer as AutumnCustomer | null | undefined}
            onDowngrade={handleWorkspaceDowngrade}
          />
        </Suspense>
      </>
    )
  }

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

      <div className="project-page-root relative h-screen overflow-hidden bg-[#F7F7F3] dark:bg-[#1f2020]">
        {/* SF Skyline Background with fade to #F7F7F3 on all sides */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          {/* Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30 dark:opacity-0"
            style={{
              backgroundImage: 'url("/landing/landmarks.jpeg")',
            }}
          />
          {/* Fade to #F7F7F3 on all sides */}
          <div
            className="absolute inset-0"
            style={{
              background: 'var(--project-page-overlay)',
            }}
          />
          {/* Subtle dark-mode ambient color to avoid flat slabs */}
          <div
            className="absolute inset-0 hidden dark:block"
            style={{
              background:
                'radial-gradient(circle at 12% 16%, rgba(135,168,118,0.11) 0%, rgba(31,32,32,0) 34%), radial-gradient(circle at 80% 12%, rgba(191,153,101,0.09) 0%, rgba(31,32,32,0) 30%)',
            }}
          />
        </div>

        {/* Fixed Top Bar - flush with top */}
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-gray-300/70 dark:border-[#575757]">
          <TopBar
            project={project}
            onMobileSidebarToggle={() => setIsSidebarVisible(!isSidebarVisible)}
            projectTheme={projectTheme}
            onToggleProjectTheme={toggleProjectTheme}
          />
        </div>

        {/* Paused Deployment Banner */}
        <div className="fixed left-0 right-0 top-[60px] z-40 px-4">
          <PausedDeploymentBanner />
        </div>

        {/* Sync Status Banner */}
        <Suspense fallback={<div className="h-8" />}>
          <SyncStatusBanner syncStatus={syncStatus} activeView={activeView} />
        </Suspense>

        {/* Mobile Sidebar Overlay */}
        {isMobile && isSidebarVisible && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setIsSidebarVisible(false)}
            />
            {/* Sidebar */}
            <motion.div
              className="fixed bottom-0 left-0 top-[36px] z-40 transform-gpu lg:hidden"
              style={{ zIndex: 45, willChange: 'transform' }}
              initial={{ x: -250, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -250, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] as const }}
            >
              <Suspense
                fallback={
                  <div className="flex h-full w-64 items-center justify-center border-r bg-white dark:border-[#575757] dark:bg-[#282828]">
                    <Loader className="h-6 w-6 animate-spin" />
                  </div>
                }
              >
                <LeftSidebar
                  activeView={activeView}
                  setActiveView={(view) => {
                    updateActiveView(view)
                    setIsSidebarVisible(false) // Close sidebar when item is selected on mobile
                  }}
                  project={project}
                  entryPoints={entryPointsArray}
                  activeEntryPoint={activeEntryPoint}
                  setActiveEntryPoint={(id) => {
                    handleSidebarClick(id)
                    setIsSidebarVisible(false) // Close sidebar when item is selected on mobile
                  }}
                  syncStatus={syncStatus}
                  onSendMessage={handleSendMessageFromSidebar}
                />
              </Suspense>
            </motion.div>
          </>
        )}

        {/* Desktop Sidebar */}
        <motion.div
          className="fixed bottom-0 left-0 top-[36px] z-20 hidden transform-gpu lg:block"
          initial={{ x: -250, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{
            duration: 0.8,
            delay: 0.2,
            ease: [0, 0, 0.2, 1] as const,
          }}
          style={{ willChange: 'transform' }}
        >
          <Suspense
            fallback={
              <div className="flex h-full w-64 items-center justify-center border-r bg-white dark:border-[#575757] dark:bg-[#282828]">
                <Loader className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            <LeftSidebar
              activeView={activeView}
              project={project}
              entryPoints={entryPointsArray}
              activeEntryPoint={activeEntryPoint}
              setActiveEntryPoint={handleSidebarClick}
              syncStatus={syncStatus}
              onSendMessage={handleSendMessageFromSidebar}
            />
          </Suspense>
        </motion.div>

        {activeView === 'default' || activeView === 'specification' ? (
          <>
            {/* Fixed Right Chat Bar - Hidden on mobile when isChatVisible is false */}
            <div
              className={`fixed right-0 top-[36px] w-full min-w-[320px] max-w-[500px] transition-transform duration-300 dark:border-l dark:border-[#343434] dark:bg-[#1f2020] dark:shadow-[-14px_0_30px_-18px_rgba(0,0,0,0.95)] lg:w-[500px] ${isMobile && !isChatVisible ? 'translate-x-full' : ''} ${isMobile ? 'bottom-[52px] z-30' : 'bottom-0 z-20'}`}
            >
              <ChatStorageProvider
                projectSemanticIdentifier={semanticIdentifier}
              >
                {/* Only render chat components after project is fully loaded */}
                {project === undefined ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center text-zinc-500 dark:text-zinc-400">
                      Loading project...
                    </div>
                  </div>
                ) : (
                  <>
                    {useAgentChat ? (
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
                          messagesStatus === 'LoadingFirstPage'
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
                  </>
                )}
              </ChatStorageProvider>
            </div>
            <div
              className="pointer-events-none fixed left-0 right-0 top-[16px] z-10"
              style={{
                height: '20px',
              }}
            />

            {/* Mobile Chat Toggle Footer */}
            {isMobile && (
              <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#d0d0d0]/70 bg-[#f1f1f1]/90 shadow-lg backdrop-blur-sm dark:border-[#575757] dark:bg-[#282828]/95">
                <button
                  onClick={() => setIsChatVisible(!isChatVisible)}
                  className="flex w-full items-center justify-center gap-2 py-3 text-center font-medium text-zinc-700 transition-all duration-300 hover:bg-[#e7e7e7] dark:text-zinc-100 dark:hover:bg-[#4a4a4a]"
                  style={{
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {isChatVisible ? 'Hide Chat' : 'Show Chat'}
                </button>
              </div>
            )}

            {/* Center Content - Full page scroll with proper spacing */}
            <div
              className={`relative z-10 overflow-y-auto pt-8 transition-all duration-300 ${isMobile ? 'ml-0 mr-0' : 'ml-0 mr-[320px] lg:ml-[204px] lg:mr-[504px]'} ${isMobile ? 'h-[calc(100vh-52px)] pb-[52px]' : 'h-screen'}`}
            >
              <Suspense fallback={<div />}>
                <div className="mx-4 mb-0 mt-2 rounded-lg border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 p-1.5 shadow-lg dark:border-[#5f5f5f] dark:from-[#282828] dark:to-[#242424]">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] leading-tight text-green-800 dark:text-zinc-100">
                        Congrats on being an early user! Claim 50% off paid
                        plans (ending in 24 hours).{' '}
                        <a
                          href="/web/dashboard"
                          className="font-semibold text-green-900 underline hover:text-green-700 dark:text-zinc-100 dark:hover:text-zinc-200"
                        >
                          Lock in a tier here
                        </a>{' '}
                        and{' '}
                        <a
                          href="https://discord.gg/2gSmB9DxJW"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-green-900 underline hover:text-green-700 dark:text-zinc-100 dark:hover:text-zinc-200"
                        >
                          join our discord
                        </a>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </Suspense>

              <Suspense fallback={<div />}>
                <>
                  {project &&
                    (activeView === 'default' ||
                      activeView === 'specification') && (
                      <div className="mx-4 mb-2 mt-4">
                        <GravityAdSlot
                          messages={[]}
                          sessionId={project._id}
                          slotKey={`center-${activeView}`}
                          variant="default"
                          placement="center"
                        />
                      </div>
                    )}
                  {activeView === 'default' ? (
                    <CenterContent
                      project={project}
                      activeEntryPoint={entryPointsArray.find(
                        (ep) => ep._id === activeEntryPoint,
                      )}
                      entryPoints={entryPointsArray}
                      isSelectingElement={isSelectingElement}
                      onCurrentPageChange={setCurrentPageUrl}
                      syncStatus={syncStatus}
                    />
                  ) : activeView === 'specification' ? (
                    <div>
                      <div className="mb-1 ml-4 mt-4 flex items-center justify-between">
                        <div className="justify-start text-sm font-semibold leading-none text-stone-500 dark:text-zinc-400">
                          Specification (currently under maintence)
                        </div>
                      </div>
                      <div className="mx-4 mb-8 mt-2 w-auto rounded-lg bg-white/60 pb-8 pl-12 pr-8 pt-12 text-sm outline outline-1 outline-offset-[-1px] outline-gray-300/80 dark:bg-[#282828]/90 dark:outline-[#575757]">
                        <MarkdownWithSuggest
                          projectSemanticIdentifier={semanticIdentifier}
                          text={project.spec || ''}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              </Suspense>
            </div>
          </>
        ) : (
          <div
            className={`relative z-10 ${isMobile ? 'ml-0' : 'ml-[200px]'}`}
            style={{
              marginTop: '36px',
              height: 'calc(100vh - 36px)',
            }}
          >
            <div
              className="pointer-events-none fixed left-0 right-0 top-[16px] z-10"
              style={{
                height: '20px',
              }}
            />

            <div className="z-10 h-full w-full overflow-y-auto bg-white p-4 pl-8 dark:bg-[#282828]">
              {/* Back arrow button */}
              <Link
                href={`/web/project/${semanticIdentifier}`}
                className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-[#575757] dark:bg-[#3c3c3c] dark:text-zinc-100 dark:hover:bg-[#4a4a4a] dark:hover:text-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Editor
              </Link>

              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Loader className="h-6 w-6 animate-spin" />
                  </div>
                }
              >
                {activeView === 'database' && (
                  <DatabaseView project={project} />
                )}
                {activeView === 'editor' && (
                  <FeatureGate
                    featureId="project_code_editor"
                    fallback={
                      <UpgradePrompt
                        featureId="project_code_editor"
                        variant="compact"
                      />
                    }
                  >
                    <EditorView projectId={project._id} />
                  </FeatureGate>
                )}
                {activeView === 'keys' && <EnvVarsView project={project} />}
                {activeView === 'versions' && (
                  <GitCommitsView project={project} />
                )}
                {activeView === 'integrations' && (
                  <IntegrationsView semanticIdentifier={semanticIdentifier} />
                )}
                {activeView === 'ui components' && (
                  <UiIntegrationView semanticIdentifier={semanticIdentifier} />
                )}
                {activeView === 'assets' && (
                  <AssetsView semanticIdentifier={semanticIdentifier} />
                )}
                {activeView === 'github' && (
                  <GitHubSyncView projectId={project._id} />
                )}
                {activeView === 'app & support' && (
                  <AppAndSupportView project={project} />
                )}
                {activeView === 'backend management' && (
                  <BackendManagement project={project} />
                )}
                {activeView === 'monitoring' && (
                  <Monitoring project={project} />
                )}
                {activeView === 'hire developers' && <HireDevelopersView />}
                {activeView === 'daytona fs' && (
                  <DaytonaFSDashboard projectId={project._id} />
                )}
              </Suspense>
            </div>
          </div>
        )}
      </div>

      {/* Project Status Dialog - shown as overlay when migration or errors detected */}
      {/* <ProjectStatusDialog
        status={projectStatus}
        semanticIdentifier={semanticIdentifier}
      />

      {/* Starter Upgrade Popup for free tier users */}
      <StarterUpgradePopup
        open={showStarterPopup}
        onOpenChange={setShowStarterPopup}
      />
    </>
  )
}
