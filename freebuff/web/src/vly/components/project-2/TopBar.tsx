'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  Loader2,
  Eye,
  Share2,
  Settings,
  Activity,
  LifeBuoy,
  Phone,
  Users as UsersIcon,
  CreditCard,
  Home,
  FolderKanban,
  Globe,
  LogOut,
  Rocket,
  History,
  Github,
} from 'lucide-react'
import { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { InviteDialog } from './InviteDialog'
import { DeploymentDialog } from './deployment/DeploymentDialog'
import { FounderContactDialog } from './FounderContactDialog'
import { EditableProjectName } from './EditableProjectName'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { signOut } from 'next-auth/react'
import type { ProjectPageTheme } from '@/vly/hooks/useProjectPageTheme'

/**
 * Compact, Lovable-style top bar for the project page.
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ [⌨ logo  Project name ▾]                  [👁] [⤴Share] [🚀 Publish] │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  - Left: dropdown menu trigger containing the Freebuff terminal logo + the
 *    editable project name. The dropdown holds Settings, Usage, Support,
 *    Hire Developers, Contact Founder, Billing, navigation, sign out.
 *  - Right: ghost icon buttons (Preview, Share) + a primary Publish button.
 *    No more Pricing / Earn Credits / sidebar hamburger.
 */
export function TopBar({
  project,
  onMobileSidebarToggle: _onMobileSidebarToggle,
}: {
  project: FunctionReturnType<typeof api.project.getProjectData>
  onMobileSidebarToggle?: () => void
  // Kept for backwards compatibility with existing call sites — dark mode is
  // enforced for Freebuff Web so these props are no longer used.
  projectTheme?: ProjectPageTheme
  onToggleProjectTheme?: () => void
}) {
  // Live GitHub sync status — when set, the dropdown menu's "Open GitHub"
  // item jumps straight to the connected repo. Otherwise it falls through
  // to the connect-GitHub flow inside settings.
  const githubSyncStatus = useQuery(
    api.github.repositories.getProjectSyncStatus,
    project?._id ? { projectId: project._id } : 'skip',
  )
  void _onMobileSidebarToggle
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [founderContactOpen, setFounderContactOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const router = useRouter()

  const publishProject = useMutation(api.community.publishProject)

  const currentUserId = useQuery(api.community.getCurrentUserId)

  // Posted to community after a successful deployment
  const handleDeployTriggered = async () => {
    if (!project) return
    setIsPublishing(true)
    try {
      await publishProject({
        projectId: project._id,
        title:
          project.name || project.semantic_identifier || 'Untitled Project',
        description: 'A project built with Freebuff',
        tags: [],
      })
      toast.success('Published to community.')
    } catch (_publishError) {
      void _publishError
      toast.error('Failed to publish to community. Please try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  const openPreviewInNewTab = () => {
    const url = project?.pretty_preview_url ?? project?.preview_url ?? ''
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openSettings = () => {
    if (!project) return
    router.push(`/web/project/${project.semantic_identifier}/settings`)
  }

  if (!project) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex h-11 w-full items-center justify-between gap-1.5 border-b border-border/60 bg-background/95 px-2 backdrop-blur-xl sm:gap-2 sm:px-3"
        style={{ contain: 'layout style paint' }}
      >
        {/* ── Left: project dropdown ───────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex max-w-[180px] items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus:bg-muted focus:outline-none sm:max-w-[260px] md:max-w-[320px]"
                aria-label="Project menu"
              >
                {/* Freebuff brand mark — uses the favicon (dark rounded
                    square + sparkle) directly so it always looks like the
                    Freebuff icon and is distinct from the old vly logo. */}
                <img
                  src="/favicon.svg"
                  alt="Freebuff"
                  className="h-6 w-6 flex-shrink-0 rounded-md object-contain"
                />
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground/90">
                  {project.name || project.semantic_identifier || 'Untitled project'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-64 rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/40"
            >
              {/* Project header */}
              <div className="px-2 py-2">
                <EditableProjectName project={project} />
              </div>
              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={openSettings}
              >
                <Settings className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Settings
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => {
                  if (githubSyncStatus) {
                    window.open(
                      `https://github.com/${githubSyncStatus.repo_owner}/${githubSyncStatus.repo_name}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  } else {
                    router.push(
                      `/web/project/${project.semantic_identifier}/settings?section=github`,
                    )
                  }
                }}
              >
                <Github className="mr-2.5 h-4 w-4 text-muted-foreground" />
                {githubSyncStatus ? 'Open on GitHub' : 'Connect GitHub'}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => {
                  if (githubSyncStatus) {
                    window.open(
                      `https://github.com/${githubSyncStatus.repo_owner}/${githubSyncStatus.repo_name}/commits`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  } else {
                    router.push(
                      `/web/project/${project.semantic_identifier}/settings?section=github`,
                    )
                  }
                }}
              >
                <History className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Version history
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() =>
                  router.push(
                    `/web/project/${project.semantic_identifier}/settings?section=usage`,
                  )
                }
              >
                <Activity className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Usage
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() =>
                  router.push(
                    `/web/project/${project.semantic_identifier}/settings?section=support`,
                  )
                }
              >
                <LifeBuoy className="mr-2.5 h-4 w-4 text-muted-foreground" />
                App &amp; Support
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() =>
                  router.push(
                    `/web/project/${project.semantic_identifier}/settings?section=hire`,
                  )
                }
              >
                <UsersIcon className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Hire Developers
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => setFounderContactOpen(true)}
              >
                <Phone className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Contact Founder
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => router.push('/web/dashboard')}
              >
                <FolderKanban className="mr-2.5 h-4 w-4 text-muted-foreground" />
                My Projects
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => router.push('/web/community')}
              >
                <Globe className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Community
              </DropdownMenuItem>

              {currentUserId && (
                <DropdownMenuItem
                  className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                  onClick={() =>
                    router.push(`/web/community/profile/${currentUserId}`)
                  }
                >
                  <Home className="mr-2.5 h-4 w-4 text-muted-foreground" />
                  Profile
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() =>
                  router.push(
                    `/web/project/${project.semantic_identifier}/settings?section=billing`,
                  )
                }
              >
                <CreditCard className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Plans &amp; Billing
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Right: icon actions ──────────────────────────────────────── */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Preview - opens in new tab. Always visible; this is the
              fastest path to a real production-style preview. */}
          <IconButton
            label="Open preview in new tab"
            onClick={openPreviewInNewTab}
          >
            <Eye className="h-4 w-4" />
          </IconButton>

          {/* Share - opens invite dialog */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <InviteDialog projectId={project._id}>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground sm:px-2.5"
                    aria-label="Share project"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </InviteDialog>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            >
              Share with collaborators
            </TooltipContent>
          </Tooltip>

          {/* Publish - primary CTA */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ml-0.5 flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_0_18px_rgba(124,255,63,0.35)] disabled:cursor-not-allowed disabled:opacity-60 sm:ml-1 sm:px-3"
                onClick={() => setDeployDialogOpen(true)}
                disabled={isPublishing}
                aria-label="Publish"
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            >
              Publish to community
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <DeploymentDialog
        isOpen={deployDialogOpen}
        onOpenChange={setDeployDialogOpen}
        projectId={project._id}
        className="glass-morphism"
        onDeployTriggered={handleDeployTriggered}
      />
      <FounderContactDialog
        open={founderContactOpen}
        onOpenChange={setFounderContactOpen}
      />
    </TooltipProvider>
  )
}

/**
 * Borderless, no-bg ghost icon button with a tooltip — Lovable style.
 */
function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
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
