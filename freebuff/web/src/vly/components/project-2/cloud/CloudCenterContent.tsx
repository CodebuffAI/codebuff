'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { FunctionReturnType } from 'convex/server'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ExternalLink,
  MousePointer,
  RotateCw,
  Github,
  MonitorCog,
  Play,
  Square,
  Loader2,
} from 'lucide-react'
import React, { useRef, useState } from 'react'
import { useIframeNavigationSync } from '../useIframeNavigationSync'
import { Spinner3D } from '../Spinner3D'
import styles from '../CenterContent.module.css'
import { useProjectConnection } from '@/vly/hooks/useProjectConnection'
import { toast } from 'sonner'
import {
  getExternalPreviewUrl,
  getDaytonaPreviewUrl,
} from '@/vly/lib/project-preview-url'
import { ConnectedRepoEnvPanel } from '../ConnectedRepoEnvPanel'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'

// Ports baked into the golden snapshot's start-services.sh.
const OPENVSCODE_PORT = 8080
const TTYD_PORT = 7681

export type CloudViewMode = 'preview' | 'code' | 'terminal' | 'env'

type PreviewConnectionStatus =
  | 'loading'
  | 'booting'
  | 'connected'
  | 'error'
  | 'idle'
  | 'restarting'

const connectionStatusMeta: Record<
  PreviewConnectionStatus,
  { label: string; dotClassName: string; pingClassName?: string }
> = {
  loading: {
    label: 'Loading connection status',
    dotClassName: 'bg-muted-foreground',
    pingClassName: 'bg-muted-foreground/50',
  },
  booting: {
    label: 'Booting preview',
    dotClassName: 'bg-amber-300',
    pingClassName: 'bg-amber-300/50',
  },
  connected: { label: 'Connected', dotClassName: 'bg-emerald-400' },
  error: { label: 'Connection error', dotClassName: 'bg-red-400' },
  idle: { label: 'Idle', dotClassName: 'bg-muted-foreground/70' },
  restarting: {
    label: 'Restarting computer',
    dotClassName: 'bg-amber-300',
    pingClassName: 'bg-amber-300/50',
  },
}

interface CloudCenterContentProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | null
  semanticIdentifier: string
  viewMode: CloudViewMode
  onViewModeChange: (mode: CloudViewMode) => void
  isSelectingElement?: boolean
  forceShowClickToTest?: boolean
  onClickToTest?: () => void
  refreshTrigger?: number
}

/**
 * Cloud-only preview/code/terminal/env surface. Forked from the shared web
 * CenterContent so Freebuff Cloud can evolve independently — trimmed of
 * web-only features (auto screenshots, god-mode publish, ad slot) and given a
 * user-controlled dev-server lifecycle.
 */
export function CloudCenterContent({
  project,
  semanticIdentifier,
  viewMode,
  onViewModeChange,
  isSelectingElement = false,
  forceShowClickToTest = false,
  onClickToTest,
  refreshTrigger = 0,
}: CloudCenterContentProps) {
  const [isIframeActive, setIsIframeActive] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const editorUrl = getDaytonaPreviewUrl(project, OPENVSCODE_PORT)
  const terminalUrl = getDaytonaPreviewUrl(project, TTYD_PORT)
  const workspaceUrl =
    viewMode === 'code' ? editorUrl : viewMode === 'terminal' ? terminalUrl : null

  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const restartDevServerAction = useAction(
    api.codesandbox.management.restartDevServer,
  )

  // --- Dev server lifecycle (user-controlled) ------------------------------
  const startPreviewAction = useAction(api.cloud.preview.startPreview)
  const stopPreviewAction = useAction(api.cloud.preview.stopPreview)
  const getPreviewStatusAction = useAction(
    api.cloud.preview.getPreviewRuntimeStatus,
  )
  const [previewRunning, setPreviewRunning] = useState<boolean | null>(null)
  const [previewCommand, setPreviewCommand] = useState<string | null>(null)
  const [isStartingPreview, setIsStartingPreview] = useState(false)
  const [isStoppingPreview, setIsStoppingPreview] = useState(false)

  const [isIframeReactReady, setIsIframeReactReady] = useState(false)
  const [hasIframeLoaded, setHasIframeLoaded] = useState(false)

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
    entryPoints: [],
    activeEntryPoint: undefined,
    setActiveEntryPoint: () => {},
  })

  const isDaytonaProject = project?.sandbox_id?.startsWith('daytona:') === true

  const refreshPreviewStatus = React.useCallback(async () => {
    if (!semanticIdentifier) return
    try {
      const status = await getPreviewStatusAction({ semanticIdentifier })
      setPreviewRunning(status.running)
      setPreviewCommand(status.previewCommand)
    } catch {
      // Sandbox may be cold; leave state as-is.
    }
  }, [getPreviewStatusAction, semanticIdentifier])

  React.useEffect(() => {
    void refreshPreviewStatus()
  }, [refreshPreviewStatus])

  React.useEffect(() => {
    setIsIframeReactReady(false)
    setHasIframeLoaded(false)
    if (!isDaytonaProject || !navState.iframeSrc) return
    const timeoutId = window.setTimeout(() => setHasIframeLoaded(true), 1200)
    return () => window.clearTimeout(timeoutId)
  }, [isDaytonaProject, navState.iframeKey, navState.iframeSrc])

  React.useEffect(() => {
    const handleRouteChange = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-route-change') {
        setIsIframeReactReady(true)
      }
    }
    window.addEventListener('message', handleRouteChange)
    return () => window.removeEventListener('message', handleRouteChange)
  }, [])

  const handleRefresh = React.useCallback(() => {
    const iframe = iframeRef.current
    const currentPath = navState.stack[navState.index]
    if (iframe && baseUrl && currentPath) {
      const currentUrl = new URL(currentPath, baseUrl)
      if (!baseUrl.includes('freebuff.dev')) {
        currentUrl.searchParams.set('_refresh', Date.now().toString())
      }
      iframe.src = currentUrl.toString()
    }
  }, [baseUrl, navState.index, navState.stack])

  const lastRefreshTriggerRef = useRef<number>(refreshTrigger)
  React.useEffect(() => {
    if (refreshTrigger === lastRefreshTriggerRef.current) return
    lastRefreshTriggerRef.current = refreshTrigger
    if (!navState.iframeSrc) return
    const id = window.setTimeout(() => handleRefresh(), 250)
    return () => window.clearTimeout(id)
  }, [refreshTrigger, handleRefresh, navState.iframeSrc])

  React.useEffect(() => {
    if (forceShowClickToTest) setIsIframeActive(false)
  }, [forceShowClickToTest])

  const {
    isConnecting,
    isError: isConnectionError,
    isSuccess: isConnectionSuccess,
  } = useProjectConnection({
    semanticIdentifier: project?.semantic_identifier,
    runtimeSurface: 'cloud',
    onSuccess: () => {
      if (baseUrl.includes('freebuff.dev')) return
      setTimeout(() => handleRefresh(), 1000)
    },
  })

  const shouldShowConnectionOverlay =
    isConnecting && !(isDaytonaProject && (hasIframeLoaded || isIframeReactReady))
  const isPreviewLoaded = hasIframeLoaded || isIframeReactReady
  const connectionStatus: PreviewConnectionStatus = (() => {
    if (!project) return 'loading'
    if (isRestarting) return 'restarting'
    if (isConnectionError) return 'error'
    if (isConnecting) return navState.iframeSrc ? 'booting' : 'loading'
    if (isConnectionSuccess) return 'connected'
    if (isDaytonaProject && isPreviewLoaded) return 'connected'
    return 'idle'
  })()
  const connectionStatusInfo = connectionStatusMeta[connectionStatus]

  const handleOverlayClick = () => {
    onClickToTest?.()
    setIsIframeActive(true)
  }

  const handleOpenInNewTab = () => {
    const externalPreviewUrl = getExternalPreviewUrl(project)
    if (externalPreviewUrl) {
      window.open(externalPreviewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleRestartComputer = async () => {
    if (!project) return
    try {
      setIsRestarting(true)
      await restartDevServerAction({ projectId: project._id })
      setTimeout(() => handleRefresh(), 2000)
    } catch {
      toast.error('Failed to restart the sandbox. Please try again.')
    } finally {
      setIsRestarting(false)
    }
  }

  const handleStartPreview = async () => {
    if (!semanticIdentifier || isStartingPreview) return
    try {
      setIsStartingPreview(true)
      const result = await startPreviewAction({ semanticIdentifier })
      if (!result.running) {
        toast.error(result.message)
      } else {
        setPreviewRunning(true)
        toast.success('Dev server starting — preview will appear shortly.')
        setTimeout(() => handleRefresh(), 4000)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start dev server')
    } finally {
      setIsStartingPreview(false)
    }
  }

  const handleStopPreview = async () => {
    if (!semanticIdentifier || isStoppingPreview) return
    try {
      setIsStoppingPreview(true)
      await stopPreviewAction({ semanticIdentifier })
      setPreviewRunning(false)
      toast.success('Dev server stopped.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to stop dev server')
    } finally {
      setIsStoppingPreview(false)
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col px-0 pb-0 pt-0 lg:px-3 lg:pb-3 lg:pt-2"
      suppressHydrationWarning
    >
      <div className="flex h-full w-full flex-col items-stretch justify-start gap-0 lg:gap-2">
        <TooltipProvider delayDuration={200}>
          <div
            className="flex w-full min-w-[220px] items-center gap-1 rounded-lg border border-border bg-card px-2 py-1"
            style={{ minHeight: 32 }}
          >
            <div className="flex items-center gap-0.5">
              <CloudToolbarTooltip label="Back">
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
              </CloudToolbarTooltip>
              <CloudToolbarTooltip label="Forward">
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
              </CloudToolbarTooltip>
              <CloudToolbarTooltip label="Refresh preview">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRefresh()
                  }}
                  disabled={!navState.iframeSrc}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Refresh"
                >
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </CloudToolbarTooltip>
            </div>
            <span
              className="hidden shrink-0 select-text truncate px-1.5 font-mono text-[11px] text-muted-foreground xl:inline-block xl:max-w-[160px]"
              style={{ letterSpacing: 0.2 }}
            >
              {navState.stack[navState.index] || (
                <span className="opacity-40">/</span>
              )}
            </span>

            {viewMode === 'preview' && (
              <div className="flex shrink-0 items-center gap-1">
                {previewRunning ? (
                  <CloudToolbarTooltip label="Stop dev server (free up sandbox resources)">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleStopPreview()
                      }}
                      disabled={isStoppingPreview}
                      className="flex h-7 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-[11px] font-medium text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {isStoppingPreview ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Square className="h-3 w-3 text-red-400" />
                      )}
                      Stop
                    </button>
                  </CloudToolbarTooltip>
                ) : (
                  <CloudToolbarTooltip label="Start the dev server">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleStartPreview()
                      }}
                      disabled={isStartingPreview}
                      className="flex h-7 items-center gap-1 rounded-md bg-primary/15 px-2 text-[11px] font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50"
                    >
                      {isStartingPreview ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Start
                    </button>
                  </CloudToolbarTooltip>
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-1 items-center" />

            <div className="flex items-center gap-0.5">
              <CloudToolbarTooltip
                label={`Connection: ${connectionStatusInfo.label}`}
              >
                <div
                  className="relative flex h-7 w-7 items-center justify-center rounded-md"
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
              </CloudToolbarTooltip>
              <CloudToolbarTooltip
                label={isRestarting ? 'Restarting computer…' : 'Restart computer'}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleRestartComputer()
                  }}
                  disabled={!project || isRestarting}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Restart computer"
                >
                  <MonitorCog
                    className={`h-4 w-4 ${isRestarting ? 'animate-pulse' : ''}`}
                    strokeWidth={1.5}
                  />
                </button>
              </CloudToolbarTooltip>
              {project?.repo_full_name && (
                <CloudToolbarTooltip
                  label={`Open on GitHub: ${project.repo_full_name}`}
                >
                  <button
                    onClick={() =>
                      window.open(
                        `https://github.com/${project.repo_full_name}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground"
                    aria-label="View on GitHub"
                  >
                    <Github className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </CloudToolbarTooltip>
              )}
              <CloudToolbarTooltip label="Open preview in new tab">
                <button
                  onClick={handleOpenInNewTab}
                  disabled={!navState.iframeSrc}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </CloudToolbarTooltip>
            </div>
          </div>
        </TooltipProvider>

        <div className="min-h-0 w-full flex-1">
          <div
            ref={iframeContainerRef}
            className={`${styles.iframeWrapper} relative h-full w-full overflow-hidden bg-card lg:rounded-lg lg:border lg:border-border lg:shadow-xl lg:shadow-black/40 ${isSelectingElement ? styles.selectingFrame : ''}`}
            suppressHydrationWarning
          >
            {viewMode === 'env' ? (
              <div className="absolute inset-0">
                <ConnectedRepoEnvPanel
                  semanticIdentifier={semanticIdentifier}
                  onOpenView={(view) => onViewModeChange(view)}
                />
              </div>
            ) : viewMode !== 'preview' ? (
              workspaceUrl ? (
                <iframe
                  key={`${viewMode}-${project?.sandbox_id ?? ''}`}
                  className="absolute inset-0 h-full w-full border-0"
                  src={workspaceUrl}
                  title={viewMode === 'code' ? 'Editor' : 'Terminal'}
                  allow="clipboard-read; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
                  suppressHydrationWarning
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-background">
                  <p className="text-muted-foreground">
                    {viewMode === 'code' ? 'Editor' : 'Terminal'} not available
                    yet.
                  </p>
                </div>
              )
            ) : navState.iframeSrc ? (
              <iframe
                key={navState.iframeKey}
                ref={iframeRef}
                className={`${styles.scaledIframe} absolute inset-0 border-0`}
                src={navState.iframeSrc}
                title={`${activeEntryPointByPath?.page?.page_title ?? 'Preview'}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                suppressHydrationWarning
                onLoad={() => setHasIframeLoaded(true)}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
                  <Play className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {previewCommand
                      ? "Dev server isn't running"
                      : 'No preview command configured yet'}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    {previewCommand
                      ? "Start the dev server when you're ready — it stays off until you ask so you control sandbox resources."
                      : 'Ask the agent to set up the dev server (e.g. "set up the preview"), or configure it in Settings.'}
                  </p>
                </div>
                {previewCommand && (
                  <button
                    type="button"
                    onClick={() => void handleStartPreview()}
                    disabled={isStartingPreview}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isStartingPreview ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Start dev server
                  </button>
                )}
                {previewCommand && (
                  <code className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {previewCommand}
                  </code>
                )}
              </div>
            )}

            <AnimatePresence>
              {shouldShowConnectionOverlay && (
                <motion.div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
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
                        Connecting to your sandbox…
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Waking up the workspace — this only takes a moment.
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!isIframeActive &&
                navState.iframeSrc &&
                !isSelectingElement &&
                viewMode === 'preview' && (
                  <motion.div
                    className="absolute inset-0 z-10 flex transform-gpu cursor-pointer flex-col items-center justify-center bg-black/35 hover:bg-black/20"
                    onClick={handleOverlayClick}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
                    style={{ willChange: 'opacity' }}
                  >
                    <div className="flex items-center gap-2 rounded-xl bg-card/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur">
                      <div
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-foreground"
                        aria-label="Click to test"
                      >
                        <MousePointer className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Click to test</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenInNewTab()
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
  )
}

function CloudToolbarTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactElement
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
  )
}
