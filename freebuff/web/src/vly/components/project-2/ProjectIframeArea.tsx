'use client'

/**
 * ProjectIframeArea
 * -----------------
 * The full right-hand pane of the project page. Lovable-style layout:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  [Preview] [Data] [Logs] [Editor] [API Keys]   <url bar>   │  ← top tabs
 *   ├────────────────────────────────────────────────────────────┤
 *   │                                                            │
 *   │                  iframe OR active view                     │
 *   │                                                            │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  [Integrations Library] [UI Components]                    │  ← bottom tabs
 *   └────────────────────────────────────────────────────────────┘
 *
 * The bottom tabs swap the iframe for the view but keep showing themselves
 * as tabs; they also surface a "← Back to preview" affordance.
 */

import { Suspense, lazy } from 'react'
import {
  Globe2,
  Database,
  ScrollText,
  Code2,
  KeyRound,
  Loader,
  ArrowLeft,
  Plug,
  Component,
  Maximize2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { api } from '@/convex/_generated/api'
import { useIsPlatformAdmin } from '@/vly/hooks/useIsPlatformAdmin'
import { CenterContent } from './CenterContent'
import { GodModeActions } from './GodModeActions'
import {
  FeatureGate,
  UpgradePrompt,
} from '@/vly/components/billing/FeatureGate'

const DatabaseView = lazy(() => import('./DatabaseView'))
const EditorView = lazy(() => import('./EditorView'))
const EnvVarsView = lazy(() => import('./EnvVarsView'))
const IntegrationsView = lazy(() => import('./IntegrationsView'))
const UiIntegrationView = lazy(() => import('./UiIntegrationView'))
const BackendManagement = lazy(() => import('./BackendManagement'))
const GitCommitsView = lazy(() => import('./GitCommitsView'))

// Tab IDs shown in the iframe area. These are deliberately a subset of the
// older `ActiveView` union — see project-2.tsx for the full set.
export type IframeTab =
  | 'preview'
  | 'database'
  | 'logs'
  | 'editor'
  | 'versions'
  | 'keys'
  | 'integrations'
  | 'ui-components'

interface ProjectIframeAreaProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>
  semanticIdentifier: string
  entryPointsArray: FunctionReturnType<typeof api.project.getEntryPoints>
  activeEntryPoint: Id<'entry_point'> | null
  isSelectingElement: boolean
  onCurrentPageChange?: (url: string) => void
  syncStatus?: FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >
  activeTab: IframeTab
  setActiveTab: (tab: IframeTab) => void
  /**
   * Whether the iframe is allowed to be visible. Brand new projects keep
   * this false until their first build settles; we then fade the iframe in.
   */
  isRevealed?: boolean
  /**
   * When the chat pane is "focused" we visually compact the iframe area —
   * dimming + scaling — so it feels secondary to the chat.
   */
  isChatExpanded?: boolean
  /**
   * Incremented externally to force the iframe to reload (e.g. right after
   * the first build finishes). Forwarded to CenterContent.
   */
  refreshTrigger?: number
  /**
   * Fired when the user explicitly engages with the iframe (currently by
   * clicking the "Click to test" overlay). The parent uses this to shrink
   * the chat back to its default size — the user is signaling they want
   * to interact with the preview, not the chat.
   */
  onClickToTest?: () => void
  /**
   * Hide the secondary tab row above the iframe. We use this on mobile
   * Preview tab so the iframe gets the full available height; tab
   * switching is exposed via the top dropdown / desktop only.
   */
  hideTabs?: boolean
  /**
   * Mobile-only: opens the preview in a new tab. Surfaced as a primary
   * floating action so users can fall back to the real URL when the
   * sandboxed preview misbehaves.
   */
  openInNewTab?: () => void
}

/** Primary tabs that swap the right-hand iframe surface. */
const TOP_TABS: { id: IframeTab; label: string; Icon: typeof Globe2 }[] = [
  { id: 'preview', label: 'Preview', Icon: Globe2 },
  { id: 'database', label: 'Data', Icon: Database },
  { id: 'logs', label: 'Logs', Icon: ScrollText },
  { id: 'editor', label: 'Editor', Icon: Code2 },
  { id: 'keys', label: 'API Keys', Icon: KeyRound },
  { id: 'integrations', label: 'Integrations', Icon: Plug },
  { id: 'ui-components', label: 'UI', Icon: Component },
]

export function ProjectIframeArea({
  project,
  semanticIdentifier,
  entryPointsArray,
  activeEntryPoint,
  isSelectingElement,
  onCurrentPageChange,
  syncStatus,
  activeTab,
  setActiveTab,
  isRevealed = true,
  isChatExpanded = false,
  refreshTrigger = 0,
  onClickToTest,
  hideTabs = false,
  openInNewTab,
}: ProjectIframeAreaProps) {
  const { isPlatformAdmin } = useIsPlatformAdmin()
  const isNonPreviewTab = activeTab !== 'preview'
  const expandedSettingsHref =
    activeTab === 'database'
      ? `/web/project/${semanticIdentifier}/settings?section=database`
      : null

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background">
      {/* ── Top tab bar ──────────────────────────────────────────────── */}
      {!hideTabs && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 bg-background px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {TOP_TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
                  }`}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                  <span className={isChatExpanded ? 'hidden' : 'hidden md:inline'}>
                    {label}
                  </span>
                </button>
              )
            })}
            {isPlatformAdmin && (
              <div className="hidden md:block">
                <GodModeActions
                  isExpanded={false}
                  layout="horizontal"
                  project={project}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile-only floating "Open in new tab" pill, top-right of the
          iframe surface. The bottom MobileTabBar already covers "back
          to chat", so we don't duplicate that affordance here — this
          single pill keeps the iframe surface as uncluttered as
          possible while still encouraging real-world testing. */}
      {hideTabs && openInNewTab && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-40 flex items-center gap-1"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            type="button"
            onClick={openInNewTab}
            className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full bg-primary/95 px-3.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-black/30 backdrop-blur transition-all active:scale-[0.97] hover:bg-primary"
            aria-label="Open preview in new tab"
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
              aria-hidden="true"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
            Open in new tab
          </button>
        </div>
      )}

      {/* ── Active surface ───────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isNonPreviewTab && (
          <div className="absolute left-3 top-3 z-30">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className="flex h-8 items-center gap-1.5 rounded-md bg-muted/80 px-2.5 text-xs font-medium text-foreground/85 backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Back to preview"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to preview
            </button>
          </div>
        )}

        {/* First-creation gate: hide the active surface until the first
            build settles, then fade + scale it in smoothly. */}
        <AnimatePresence mode="wait">
          {!isRevealed ? (
            <motion.div
              key="iframe-waiting"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60">
                <Loader className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Generating your project…
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The preview will appear here once the first build finishes.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="iframe-revealed"
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
            >
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader className="h-5 w-5 animate-spin text-primary" />
                  </div>
                }
              >
                <ActiveSurface
                  activeTab={activeTab}
                  project={project}
                  semanticIdentifier={semanticIdentifier}
                  entryPointsArray={entryPointsArray}
                  activeEntryPoint={activeEntryPoint}
                  isSelectingElement={isSelectingElement}
                  onCurrentPageChange={onCurrentPageChange}
                  syncStatus={syncStatus}
                  refreshTrigger={refreshTrigger}
                  forceShowClickToTest={isChatExpanded}
                  onClickToTest={onClickToTest}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Pulled out so we can keep the framer-motion reveal wrapper concise while
 * still routing across every tab. Anything inside here behaves exactly as
 * before — the parent component decides if/when to mount it.
 */
function ActiveSurface({
  activeTab,
  project,
  semanticIdentifier,
  entryPointsArray,
  activeEntryPoint,
  isSelectingElement,
  onCurrentPageChange,
  syncStatus,
  refreshTrigger,
  forceShowClickToTest,
  onClickToTest,
}: {
  activeTab: IframeTab
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>
  semanticIdentifier: string
  entryPointsArray: FunctionReturnType<typeof api.project.getEntryPoints>
  activeEntryPoint: Id<'entry_point'> | null
  isSelectingElement: boolean
  onCurrentPageChange?: (url: string) => void
  syncStatus?: FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >
  refreshTrigger: number
  forceShowClickToTest: boolean
  onClickToTest?: () => void
}) {
  return (
    <>
      {activeTab === 'preview' && (
        <div className="h-full w-full">
          <CenterContent
            project={project}
            activeEntryPoint={entryPointsArray.find(
              (ep) => ep._id === activeEntryPoint,
            )}
            entryPoints={entryPointsArray}
            isSelectingElement={isSelectingElement}
            onCurrentPageChange={onCurrentPageChange}
            syncStatus={syncStatus}
            refreshTrigger={refreshTrigger}
            forceShowClickToTest={forceShowClickToTest}
            onClickToTest={onClickToTest}
          />
        </div>
      )}

      {activeTab === 'database' && (
        <ViewSurface>
          <DatabaseView project={project} />
        </ViewSurface>
      )}

      {activeTab === 'logs' && (
        <ViewSurface>
          <BackendManagement project={project} />
        </ViewSurface>
      )}

      {activeTab === 'editor' && (
        <ViewSurface>
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
        </ViewSurface>
      )}

      {activeTab === 'versions' && (
        <div className="h-full w-full overflow-hidden bg-background pt-12">
          <GitCommitsView project={project} />
        </div>
      )}

      {activeTab === 'keys' && (
        <ViewSurface>
          <EnvVarsView project={project} />
        </ViewSurface>
      )}

      {activeTab === 'integrations' && (
        <ViewSurface>
          <IntegrationsView semanticIdentifier={semanticIdentifier} />
        </ViewSurface>
      )}

      {activeTab === 'ui-components' && (
        <ViewSurface>
          <UiIntegrationView semanticIdentifier={semanticIdentifier} />
        </ViewSurface>
      )}
    </>
  )
}

function ViewSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden bg-background px-3 pb-3 pt-12">
      {children}
    </div>
  )
}
