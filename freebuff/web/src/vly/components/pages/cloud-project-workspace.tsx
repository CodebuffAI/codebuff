'use client'

import { api } from '@/convex/_generated/api'
import { useQuery, useConvexAuth } from 'convex/react'
import { motion } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { AgentChatShell } from '../project-2/agent-chat'
import { useIsMobile } from '@/vly/hooks/use-mobile'
import { ChatStorageProvider } from '@/vly/contexts/ChatStorageContext'
import { ProjectStatusDialog } from '../project-2/ProjectStatusDialog'
import { ProjectLoadingScreen } from './project-2'
import { CloudTopBar } from '../project-2/cloud/CloudTopBar'
import { CloudIframeArea } from '../project-2/cloud/CloudIframeArea'
import type { CloudTab } from '../project-2/cloud/CloudWorkspaceTabs'
import { SandboxTierNotice } from '../project-2/SandboxTierNotice'
import { AmbientBackdrop } from '../app-shell/AmbientBackdrop'
import { ActiveSessionTakeoverOverlay } from '../project-2/ActiveSessionTakeoverOverlay'
import { useActiveSession } from '@/vly/hooks/useActiveSession'

/**
 * Cloud-only project workspace shell. Forked from the shared web `Project2`
 * page so Freebuff Cloud owns its layout end-to-end (cloud top bar, workspace
 * tabs above the iframe, git tab, onboarding) without touching any web code.
 *
 * It's deliberately leaner than the web shell: connected repos always use the
 * agent chat, have no entry-point/legacy-view system, and no CodeSandbox
 * migration flow.
 */
export function CloudProjectWorkspace() {
  const params = useParams()
  const semanticIdentifier = typeof params.id === 'string' ? params.id : ''

  return (
    <CloudProjectWorkspaceInner
      key={semanticIdentifier}
      semanticIdentifier={semanticIdentifier}
    />
  )
}

function CloudProjectWorkspaceInner({
  semanticIdentifier,
}: {
  semanticIdentifier: string
}) {
  const router = useRouter()
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const projectQuery = useQuery(api.project.getProjectData, { semanticIdentifier })
  // Keep the last loaded project so a transient auth/Convex re-subscribe (which
  // briefly returns `undefined`) can't unmount the whole workspace — that
  // unmount is what flashes the loading screen and refires the Gravity ad
  // `/ack` beacon every cycle. `null` (genuinely not found) is still respected;
  // only `undefined` (loading/re-subscribe) falls back to the last known value.
  const loadedProjectRef = useRef(projectQuery)
  if (projectQuery !== undefined) loadedProjectRef.current = projectQuery
  const project =
    projectQuery !== undefined ? projectQuery : loadedProjectRef.current
  const isMobile = useIsMobile()

  // One active project/agent at a time per user — seamless take-over prompt.
  const activeSession = useActiveSession({
    projectId: project?._id,
    semanticIdentifier,
    surface: 'cloud',
    enabled: isAuthenticated && !!project?._id,
  })

  const [cloudTab, setCloudTab] = useState<CloudTab>('preview')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)
  const chatAsideRef = useRef<HTMLElement>(null)
  // Imperative bridge so the preview pane can push dev-server logs into chat.
  const sendChatMessageRef = useRef<
    ((message: string) => Promise<boolean>) | null
  >(null)

  const handleSendLogsToChat = useCallback(
    async (logs: string, previewCommand: string | null) => {
      const send = sendChatMessageRef.current
      if (!send) {
        toast.error('Chat is not ready yet — try again in a moment.')
        return
      }
      if (isMobile) setMobileView('chat')
      const commandLine = previewCommand
        ? `The dev server command is:\n\`${previewCommand}\`\n\n`
        : ''
      const message =
        `The dev server failed to start. ${commandLine}` +
        `Here are the recent logs — please diagnose the issue (e.g. missing env vars, wrong command/port) and fix it so the preview runs:\n\n` +
        '```\n' +
        logs.slice(-6000) +
        '\n```'
      await send(message)
    },
    [isMobile],
  )

  const [hasAuthSettled, setHasAuthSettled] = useState(false)
  useEffect(() => {
    if (!isAuthLoading) setHasAuthSettled(true)
  }, [isAuthLoading])

  // EXPAND when the chat input gains focus (mirrors web behavior).
  useEffect(() => {
    if (isMobile) return
    const aside = chatAsideRef.current
    if (!aside) return
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      const isTextInput =
        tag === 'TEXTAREA' ||
        (tag === 'INPUT' &&
          (target as HTMLInputElement).type !== 'file' &&
          (target as HTMLInputElement).type !== 'button' &&
          (target as HTMLInputElement).type !== 'checkbox') ||
        target.isContentEditable === true
      if (isTextInput) setIsChatExpanded(true)
    }
    aside.addEventListener('focusin', handleFocusIn)
    return () => aside.removeEventListener('focusin', handleFocusIn)
  }, [isMobile, project?._id])

  // Only take over the whole screen on the FIRST load. Once auth has settled and
  // a project has loaded, keep the workspace mounted through transient auth
  // revalidations so it doesn't flash/remount (see `project` latch above).
  if ((!hasAuthSettled && isAuthLoading) || project === undefined) {
    return <ProjectLoadingScreen />
  }

  if (!project) {
    if (!hasAuthSettled || !isAuthenticated) {
      return <ProjectLoadingScreen />
    }
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background font-sans">
          <main className="flex flex-1 flex-col items-center justify-center bg-background p-4" />
        </div>
        <ProjectStatusDialog
          status="not-found"
          semanticIdentifier={semanticIdentifier}
        />
      </>
    )
  }

  // A non-preview tab (Code / Terminal / Env / Git) needs the most room, so we
  // compact the chat and hand the width to the right pane — same idea as web.
  const isSideTabActive = !isMobile && cloudTab !== 'preview'
  const chatWidth = isSideTabActive
    ? isChatExpanded
      ? '34%'
      : '26%'
    : isChatExpanded
      ? '50%'
      : '42%'

  return (
    <>
      <div className="project-page-root fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#1e1e1e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-80"
        >
          <AmbientBackdrop />
        </div>
        <ActiveSessionTakeoverOverlay
          open={activeSession.conflict}
          onTakeOver={activeSession.takeOver}
          takingOver={activeSession.takingOver}
          holderLabel={activeSession.holderLabel}
        />
        {(!isMobile || mobileView === 'chat') && (
          <div className="relative z-50 flex-shrink-0">
            <CloudTopBar project={project} />
          </div>
        )}

        {(!isMobile || mobileView === 'chat') && (
          <div className="relative z-30 flex-shrink-0">
            <SandboxTierNotice runtimeSurface="cloud" />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
          {/* ── Chat ─────────────────────────────────────────────────── */}
          <motion.aside
            ref={chatAsideRef}
            initial={false}
            animate={isMobile ? undefined : { width: chatWidth }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }}
            className={`cloud-sidebar relative flex h-full min-h-0 flex-col overflow-hidden border-r border-border ${
              isMobile
                ? `w-full ${mobileView === 'chat' ? 'flex' : 'hidden'}`
                : `max-w-[820px] ${isSideTabActive ? 'min-w-[300px]' : 'min-w-[400px]'}`
            }`}
            style={isMobile ? undefined : { willChange: 'width' }}
          >
            <ChatStorageProvider projectSemanticIdentifier={semanticIdentifier}>
              <AgentChatShell
                project={project}
                projectSemanticIdentifier={semanticIdentifier}
                hideElementSelector
                onRegisterSendMessage={(send) => {
                  sendChatMessageRef.current = send
                }}
                onOpenGitHub={() => {
                  if (project.repo_full_name) {
                    window.open(
                      `https://github.com/${project.repo_full_name}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  } else {
                    router.push(
                      `/cloud/project/${semanticIdentifier}/settings?section=git`,
                    )
                  }
                }}
                githubActionLabel={
                  project.repo_full_name ? 'View on GitHub' : 'Connect GitHub'
                }
              />
            </ChatStorageProvider>
          </motion.aside>

          {/* ── Workspace ────────────────────────────────────────────── */}
          <section
            className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${
              isMobile && mobileView !== 'preview' ? 'hidden' : ''
            }`}
          >
            <CloudIframeArea
              project={project}
              semanticIdentifier={semanticIdentifier}
              cloudTab={cloudTab}
              onCloudTabChange={(tab) => {
                setCloudTab(tab)
                if (!isMobile && tab !== 'preview') setIsChatExpanded(false)
              }}
              forceShowClickToTest={!isMobile && isChatExpanded}
              onClickToTest={() => {
                if (!isMobile) setIsChatExpanded(false)
              }}
              refreshTrigger={refreshKey}
              hideTabs={isMobile}
              onSendLogsToChat={handleSendLogsToChat}
            />
          </section>
        </div>

        {isMobile && (
          <CloudMobileTabBar view={mobileView} onChange={setMobileView} />
        )}
      </div>

      <ProjectStatusDialog status={null} semanticIdentifier={semanticIdentifier} />
    </>
  )
}

function CloudMobileTabBar({
  view,
  onChange,
}: {
  view: 'chat' | 'preview'
  onChange: (next: 'chat' | 'preview') => void
}) {
  return (
    <nav
      className="cloud-titlebar relative z-40 flex flex-shrink-0 items-stretch justify-around gap-1 border-t border-border px-2 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5"
      aria-label="Project navigation"
    >
      {(['chat', 'preview'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          aria-pressed={view === tab}
          className={`relative flex h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
            view === tab
              ? 'bg-muted text-foreground'
              : 'text-foreground/60 hover:bg-white/[0.04] hover:text-foreground'
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}
