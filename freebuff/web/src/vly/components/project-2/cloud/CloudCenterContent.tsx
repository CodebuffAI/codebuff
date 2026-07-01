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
  Settings,
  MessageSquare,
  AlertTriangle,
  TerminalSquare,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
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
import { CloudCustomLinksPanel } from './CloudCustomLinksPanel'
import { GravityAdSlot } from '../agent-chat/GravityAdSlot'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { VmStatusPopover } from '../VmStatusPopover'
import type { SandboxSize } from '@/vly/lib/sandbox-specs'

// Cloud workspace service ports (editor port is forced by cloud connection strategy).
const OPENVSCODE_PORT = 43867
const TTYD_PORT = 7681

export type CloudViewMode = 'preview' | 'code' | 'terminal' | 'env' | 'links'

/** Lifecycle phase of the user-controlled dev server / preview. */
type PreviewPhase = 'idle' | 'starting' | 'failed' | 'connected'

type PreviewState = {
  running: boolean
  listening: boolean
  statusCode: string | null
  logs: string
  previewCommand: string | null
  previewPort: number | null
  buildCommand: string | null
  previewUrl: string | null
}

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
  /** Send the captured dev-server logs into the agent chat for diagnosis. */
  onSendLogsToChat?: (logs: string, previewCommand: string | null) => void
}

/**
 * Cloud-only preview/code/terminal/env surface. Forked from the shared web
 * CenterContent so Freebuff Cloud can evolve independently — trimmed of
 * web-only features (auto screenshots, god-mode publish) and given a
 * user-controlled dev-server lifecycle. Keeps the above-iframe sponsored slot.
 *
 * Preview lifecycle: the dev server never auto-starts. The user presses Start
 * (centered over the empty pane). We then poll the sandbox for the real
 * dev-server state and stream its logs; the preview iframe is only mounted once
 * the server is actually answering HTTP — so the Daytona proxy's "Is the Sandbox
 * started?" error page never leaks into the iframe. If the server fails to come
 * up, the logs and a "Send logs to chat" button are surfaced for diagnosis.
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
  onSendLogsToChat,
}: CloudCenterContentProps) {
  const router = useRouter()
  const [isIframeActive, setIsIframeActive] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const editorUrl = getDaytonaPreviewUrl(project, OPENVSCODE_PORT)
  const terminalUrl = getDaytonaPreviewUrl(project, TTYD_PORT)
  const isWorkspaceView = viewMode === 'code' || viewMode === 'terminal'
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
  const getPreviewStateAction = useAction(api.cloud.preview.getPreviewState)
  const setRuntimeConfigAction = useAction(api.cloud.preview.setRuntimeConfig)

  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStoppingPreview, setIsStoppingPreview] = useState(false)
  const [hasAttemptedStart, setHasAttemptedStart] = useState(false)

  const running = previewState?.running ?? false
  const listening = previewState?.listening ?? false
  const previewCommand = previewState?.previewCommand ?? null
  const previewLogs = previewState?.logs ?? ''

  const phase: PreviewPhase = listening
    ? 'connected'
    : running || isStarting
      ? 'starting'
      : hasAttemptedStart
        ? 'failed'
        : 'idle'

  const [isIframeReactReady, setIsIframeReactReady] = useState(false)
  const [hasIframeLoaded, setHasIframeLoaded] = useState(false)
  const [workspaceIframeLoaded, setWorkspaceIframeLoaded] = useState(false)

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

  const refreshPreviewState =
    React.useCallback(async (): Promise<PreviewState | null> => {
      if (!semanticIdentifier) return null
      try {
        const state = await getPreviewStateAction({ semanticIdentifier })
        setPreviewState(state)
        return state
      } catch {
        // Sandbox may be cold; leave state as-is.
        return null
      }
    }, [getPreviewStateAction, semanticIdentifier])

  // Initial snapshot so a server the agent already started (or a return visit)
  // shows the live preview immediately.
  React.useEffect(() => {
    void refreshPreviewState()
  }, [refreshPreviewState])

  // Poll while the server is coming up so we can stream logs and detect the
  // moment it starts answering HTTP. Stops as soon as it connects, crashes, or
  // the user leaves the preview tab — we never poll an idle sandbox. Each probe
  // hits the sandbox (connect + curl + logs), so we self-schedule the next tick
  // only after the previous one resolves to avoid overlapping requests.
  const shouldPollPreview =
    viewMode === 'preview' && !listening && (isStarting || running)
  React.useEffect(() => {
    if (!shouldPollPreview) return
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      const state = await refreshPreviewState()
      if (cancelled) return
      if (state?.listening) {
        setIsStarting(false)
        return
      }
      if (state && !state.running) {
        // Process exited before binding the port -> treat as a failed start.
        setIsStarting(false)
        return
      }
      timer = window.setTimeout(tick, 3000)
    }
    timer = window.setTimeout(tick, 1500)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [shouldPollPreview, refreshPreviewState])

  React.useEffect(() => {
    setIsIframeReactReady(false)
    setHasIframeLoaded(false)
    if (!isDaytonaProject || !navState.iframeSrc) return
    const timeoutId = window.setTimeout(() => setHasIframeLoaded(true), 1200)
    return () => window.clearTimeout(timeoutId)
  }, [isDaytonaProject, navState.iframeKey, navState.iframeSrc])

  React.useEffect(() => {
    if (!isWorkspaceView) {
      setWorkspaceIframeLoaded(false)
      return
    }
    setWorkspaceIframeLoaded(false)
  }, [isWorkspaceView, workspaceUrl])

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

  // Auto-refresh once the dev server starts answering. There can be a short lag
  // between "port is listening" and the proxy resolving the container, so we
  // give it a beat before the (now first) mount settles.
  const wasListeningRef = useRef(false)
  React.useEffect(() => {
    if (listening && !wasListeningRef.current) {
      wasListeningRef.current = true
      const id = window.setTimeout(() => handleRefresh(), 600)
      return () => window.clearTimeout(id)
    }
    if (!listening) wasListeningRef.current = false
  }, [listening, handleRefresh])

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
    error: connectionError,
  } = useProjectConnection({
    semanticIdentifier: project?.semantic_identifier,
    runtimeSurface: 'cloud',
    onSuccess: () => {
      if (baseUrl.includes('freebuff.dev')) return
      setTimeout(() => handleRefresh(), 1000)
    },
  })

  const shouldShowConnectionOverlay =
    phase === 'connected' &&
    isConnecting &&
    !(isDaytonaProject && (hasIframeLoaded || isIframeReactReady))
  const isPreviewLoaded = hasIframeLoaded || isIframeReactReady
  const connectionStatus: PreviewConnectionStatus = (() => {
    if (!project) return 'loading'
    if (isRestarting) return 'restarting'
    if (isConnectionError) return 'error'
    if (phase === 'starting') return 'booting'
    if (phase === 'connected') {
      if (isConnectionSuccess) return 'connected'
      if (isDaytonaProject && isPreviewLoaded) return 'connected'
      return 'booting'
    }
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

  const handleOpenPreviewSettings = () => {
    router.push(`/cloud/project/${semanticIdentifier}/settings?section=preview`)
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
    if (!semanticIdentifier || isStarting) return
    setHasAttemptedStart(true)
    setIsStarting(true)
    try {
      const result = await startPreviewAction({ semanticIdentifier })
      if (!result.running) {
        toast.error(result.message)
        setIsStarting(false)
      } else {
        void refreshPreviewState()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start dev server')
      setIsStarting(false)
    }
  }

  const handleStopPreview = async () => {
    if (!semanticIdentifier || isStoppingPreview) return
    try {
      setIsStoppingPreview(true)
      await stopPreviewAction({ semanticIdentifier })
      setIsStarting(false)
      setHasAttemptedStart(false)
      wasListeningRef.current = false
      await refreshPreviewState()
      toast.success('Dev server stopped.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to stop dev server')
    } finally {
      setIsStoppingPreview(false)
    }
  }

  const handleSendLogsToChat = () => {
    const trimmed = previewLogs.trim()
    onSendLogsToChat?.(
      trimmed.length > 0 ? trimmed : '(no dev server logs were captured)',
      previewCommand,
    )
    toast.success('Sent dev server logs to chat for diagnosis.')
  }

  const handleSaveCommand = async (command: string) => {
    if (!semanticIdentifier) return
    try {
      await setRuntimeConfigAction({
        semanticIdentifier,
        previewCommand: command,
      })
      await refreshPreviewState()
      toast.success('Saved preview command')
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to save preview command',
      )
    }
  }

  const isPreviewRunning = running || phase === 'connected'

  return (
    <div
      className="flex h-full w-full flex-col"
      suppressHydrationWarning
    >
      <div className="flex h-full w-full flex-col items-stretch justify-start gap-0">
        <TooltipProvider delayDuration={200}>
          <div
            className="flex w-full min-w-[220px] items-center gap-1 border-b border-border bg-[#181818] px-2 py-1"
            style={{ minHeight: 36 }}
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
                  disabled={!navState.iframeSrc || phase !== 'connected'}
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

            {/* Above-iframe sponsored slot. Stretches to fill remaining toolbar
                width; CSS truncate handles clipping. Mirrors Freebuff Web. */}
            <div className="flex min-w-0 flex-1 items-center overflow-hidden px-1">
              <GravityAdSlot
                messages={[
                  {
                    role: 'user',
                    content: `Previewing ${project?.name || project?.semantic_identifier || semanticIdentifier || 'a project'} in Freebuff Cloud`,
                  },
                ]}
                sessionId={`${project?.semantic_identifier ?? semanticIdentifier ?? 'project'}-above-iframe`}
                slotKey={`Above-iFrame-${project?.semantic_identifier ?? semanticIdentifier ?? 'project'}`}
                placement="above-iframe"
                variant="nav"
              />
            </div>

            <div className="flex items-center gap-0.5">
              {/* The Start control lives in the center of the empty pane, not
                  here. Stop stays in the toolbar while the server is running. */}
              {viewMode === 'preview' && isPreviewRunning && (
                <CloudToolbarTooltip label="Stop dev server (free up sandbox resources)">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleStopPreview()
                    }}
                    disabled={isStoppingPreview}
                    className="mr-0.5 flex h-7 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-[11px] font-medium text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {isStoppingPreview ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Square className="h-3 w-3 text-red-400" />
                    )}
                    Stop
                  </button>
                </CloudToolbarTooltip>
              )}
              <VmStatusPopover
                projectId={project?._id}
                sandboxSize={project?.sandbox_size as SandboxSize | undefined}
                statusLabel={connectionStatusInfo.label}
                dotClassName={connectionStatusInfo.dotClassName}
                pingClassName={connectionStatusInfo.pingClassName}
                connectionErrorMessage={
                  isConnectionError && connectionError instanceof Error
                    ? connectionError.message
                    : null
                }
              />
              <CloudToolbarTooltip label="Preview settings">
                <button
                  onClick={handleOpenPreviewSettings}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition hover:bg-muted hover:text-foreground"
                  aria-label="Preview settings"
                >
                  <Settings className="h-4 w-4" strokeWidth={1.5} />
                </button>
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
                  disabled={!navState.iframeSrc || phase !== 'connected'}
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
            className={`${styles.iframeWrapper} relative h-full w-full overflow-hidden bg-card ${isSelectingElement ? styles.selectingFrame : ''}`}
            suppressHydrationWarning
          >
            {viewMode === 'env' ? (
              <div className="absolute inset-0">
                <ConnectedRepoEnvPanel
                  semanticIdentifier={semanticIdentifier}
                  onOpenView={(view) => onViewModeChange(view)}
                />
              </div>
            ) : viewMode === 'links' ? (
              <div className="absolute inset-0">
                <CloudCustomLinksPanel
                  semanticIdentifier={semanticIdentifier}
                  onOpenView={(view) => onViewModeChange(view)}
                />
              </div>
            ) : isWorkspaceView ? (
              workspaceUrl ? (
                <iframe
                  key={`${viewMode}-${project?.sandbox_id ?? ''}`}
                  className="absolute inset-0 h-full w-full border-0"
                  src={workspaceUrl}
                  title={viewMode === 'code' ? 'Editor' : 'Terminal'}
                  allow="clipboard-read; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
                  suppressHydrationWarning
                  onLoad={() => setWorkspaceIframeLoaded(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-background">
                  <p className="text-muted-foreground">
                    {viewMode === 'code' ? 'Editor' : 'Terminal'} not available
                    yet.
                  </p>
                </div>
              )
            ) : phase === 'connected' && navState.iframeSrc ? (
              <iframe
                key={navState.iframeKey}
                ref={iframeRef}
                className="absolute inset-0 h-full w-full border-0"
                src={navState.iframeSrc}
                title={`${activeEntryPointByPath?.page?.page_title ?? 'Preview'}`}
                allow="accelerometer; autoplay; clipboard-read; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
                suppressHydrationWarning
                onLoad={() => setHasIframeLoaded(true)}
              />
            ) : (
              <PreviewControlPanel
                phase={phase}
                previewCommand={previewCommand}
                logs={previewLogs}
                statusCode={previewState?.statusCode ?? null}
                isStarting={isStarting}
                isStopping={isStoppingPreview}
                onStart={() => void handleStartPreview()}
                onStop={() => void handleStopPreview()}
                onSendLogsToChat={
                  onSendLogsToChat ? handleSendLogsToChat : undefined
                }
                onSaveCommand={handleSaveCommand}
                onOpenSettings={handleOpenPreviewSettings}
              />
            )}

            <AnimatePresence>
              {isWorkspaceView && workspaceUrl && !workspaceIframeLoaded && (
                <motion.div
                  className="absolute inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.div
                    className="flex flex-col items-center gap-4"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.98, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Spinner3D size={30} />
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        Opening {viewMode === 'code' ? 'VS Code' : 'terminal'}…
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Loading the sandbox workspace session.
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

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
                phase === 'connected' && (
                  <motion.div
                    className="absolute inset-0 z-10 flex transform-gpu cursor-pointer flex-col items-center justify-center bg-black/35 hover:bg-black/20"
                    onClick={handleOverlayClick}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
                    style={{ willChange: 'opacity' }}
                  >
                    <div className="flex items-center gap-2 rounded-md border border-border bg-[#202020]/95 p-1.5 shadow-lg shadow-black/40 backdrop-blur">
                      <div
                        className="flex items-center gap-2 rounded px-3 py-2 text-foreground"
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
                        className="flex items-center gap-2 rounded bg-primary/15 px-3 py-2 text-primary transition-colors hover:bg-primary/25"
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

/**
 * Centered control surface shown in place of the iframe whenever the dev server
 * isn't actively serving. Owns the Start button (idle), the streaming-log view
 * (starting / failed), and the "Send logs to chat" escape hatch.
 */
function PreviewControlPanel({
  phase,
  previewCommand,
  logs,
  statusCode,
  isStarting,
  isStopping,
  onStart,
  onStop,
  onSendLogsToChat,
  onSaveCommand,
  onOpenSettings,
}: {
  phase: PreviewPhase
  previewCommand: string | null
  logs: string
  statusCode: string | null
  isStarting: boolean
  isStopping: boolean
  onStart: () => void
  onStop: () => void
  onSendLogsToChat?: () => void
  onSaveCommand: (command: string) => Promise<void>
  onOpenSettings: () => void
}) {
  const showLogs = phase === 'starting' || phase === 'failed'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      {phase === 'idle' && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-[#202020]">
            <Play className="h-6 w-6 text-primary" />
          </div>
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-foreground">
              {previewCommand
                ? 'Preview is off'
                : 'No preview command configured yet'}
            </p>
            <p className="mx-auto mt-1 text-xs text-muted-foreground">
              {previewCommand
                ? "The dev server stays off until you start it, so you control sandbox resources. Logs stream here while it boots."
                : 'Set the dev command below (or ask the agent to "set up the preview"). You can edit it any time.'}
            </p>
          </div>

          <PreviewCommandEditor
            command={previewCommand}
            onSave={onSaveCommand}
            onOpenSettings={onOpenSettings}
          />

          {previewCommand && (
            <button
              type="button"
              onClick={onStart}
              disabled={isStarting}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start dev server
            </button>
          )}
        </>
      )}

      {showLogs && (
        <>
          {phase === 'starting' ? (
            <>
              <Spinner3D size={34} />
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-foreground">
                  Starting dev server…
                </p>
                <p className="mx-auto mt-1 text-xs text-muted-foreground">
                  Waiting for it to start serving. The preview opens
                  automatically once it&apos;s reachable.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div className="max-w-md">
                <p className="text-sm font-semibold text-foreground">
                  Dev server didn&apos;t start
                </p>
                <p className="mx-auto mt-1 text-xs text-muted-foreground">
                  The process exited before serving
                  {statusCode && statusCode !== '000'
                    ? ` (last status ${statusCode})`
                    : ''}
                  . Check the logs below — it&apos;s often a missing env var or a
                  bad command. Fix the command inline or send the logs to chat.
                </p>
              </div>
            </>
          )}

          <PreviewCommandEditor
            command={previewCommand}
            onSave={onSaveCommand}
            onOpenSettings={onOpenSettings}
          />

          <PreviewLogView logs={logs} />

          <div className="flex flex-wrap items-center justify-center gap-2">
            {onSendLogsToChat && (
              <button
                type="button"
                onClick={onSendLogsToChat}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                <MessageSquare className="h-4 w-4" />
                Send logs to chat
              </button>
            )}
            {phase === 'failed' ? (
              <button
                type="button"
                onClick={onStart}
                disabled={isStarting}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                {isStarting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 text-primary" />
                )}
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                disabled={isStopping}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                {isStopping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 text-red-400" />
                )}
                Stop
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Inline preview-command override. Lets the user read and edit the dev command
 * right in the preview pane (no trip to Settings) — handy for fixing a bad
 * command without leaving the workspace. The settings gear is still available
 * for the full preview/port/build config.
 */
function PreviewCommandEditor({
  command,
  onSave,
  onOpenSettings,
}: {
  command: string | null
  onSave: (command: string) => Promise<void>
  onOpenSettings: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(command ?? '')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (!editing) setValue(command ?? '')
  }, [command, editing])

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex w-full max-w-xl items-center gap-1.5 rounded-lg border border-primary/40 bg-background py-1 pl-2.5 pr-1">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          spellCheck={false}
          placeholder="npm run dev -- -p 3000 -H 0.0.0.0"
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !value.trim()}
          aria-label="Save preview command"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          aria-label="Cancel"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  if (!command) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        <Pencil className="h-4 w-4" />
        Set preview command
      </button>
    )
  }

  return (
    <div className="flex w-full max-w-xl items-center gap-1.5 rounded-lg border border-border bg-muted/40 py-1 pl-2.5 pr-1">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Preview
      </span>
      <code className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-foreground/85">
        {command}
      </code>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Edit preview command"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open full preview settings"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Settings className="h-3 w-3" />
      </button>
    </div>
  )
}

function PreviewLogView({ logs }: { logs: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const text = logs.trim().length > 0 ? logs : 'Waiting for output…'

  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-[#0b0b0d] text-left">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">
          Dev server logs
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-56 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80"
      >
        <pre className="whitespace-pre-wrap break-words">{text}</pre>
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
