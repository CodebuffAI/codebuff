'use client'

import React from 'react'
import {
  ChevronDown,
  Eye,
  Share2,
  Settings,
  Activity,
  Gift,
  Home,
  Globe,
  LogOut,
  Github,
  User,
  Link as LinkIcon,
} from 'lucide-react'
import { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { InviteDialog } from './InviteDialog'
import { EditableProjectName } from './EditableProjectName'
import { BetaBadge } from '@/vly/components/app-shell/BetaBadge'
import { DiscordIcon } from '@/vly/components/app-shell/DiscordIcon'
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
import { useQuery } from 'convex/react'
import { signOut } from 'next-auth/react'
import type { ProjectPageTheme } from '@/vly/hooks/useProjectPageTheme'
import { getExternalPreviewUrl } from '@/vly/lib/project-preview-url'

/**
 * Compact, Lovable-style top bar for the project page.
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ [⌨ logo  Project name ▾]                  [👁] [⤴Share] [🚀 Publish] │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  - Left: dropdown menu trigger containing the Freebuff terminal logo + the
 *    editable project name. The dropdown holds project actions, navigation,
 *    and sign out.
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
  const router = useRouter()

  const currentUserId = useQuery(api.community.getCurrentUserId)

  const openPreviewInNewTab = () => {
    const url = getExternalPreviewUrl(project) ?? ''
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyPreviewUrl = async () => {
    const url = getExternalPreviewUrl(project) ?? ''
    if (!url) {
      toast.error('No preview URL available yet.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Preview URL copied to clipboard.')
    } catch {
      toast.error('Could not copy the URL. Please copy it manually.')
    }
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
                {/* Freebuff brand mark — uses the canonical logo asset
                    directly so it always looks like the Freebuff icon and is
                    distinct from the old vly logo. */}
                <img
                  src="/logo-icon.png"
                  alt="Freebuff"
                  className="h-6 w-6 flex-shrink-0 object-contain"
                />
                <BetaBadge className="hidden sm:inline-flex" />
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
                onClick={() => router.push('/web/dashboard')}
              >
                <Home className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Home
              </DropdownMenuItem>

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
                onClick={() =>
                  router.push(
                    `/web/project/${project.semantic_identifier}/settings?section=usage`,
                  )
                }
              >
                <Activity className="mr-2.5 h-4 w-4 text-muted-foreground" />
                Usage
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => router.push('/web/settings')}
              >
                <User className="mr-2.5 h-4 w-4 text-muted-foreground" />
                User settings
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

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => router.push('/web/referrals')}
                aria-label="Referrals"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Gift className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            >
              Referrals
            </TooltipContent>
          </Tooltip>

          {/* Beta notice — Discord button with the report-issues text to its
              right. Text collapses on narrow screens; the icon stays clickable. */}
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="This is a beta: report issues in our Discord"
            className="flex h-8 min-w-0 shrink items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <DiscordIcon className="h-4 w-4 shrink-0 text-[#5865F2]" />
            <span className="hidden truncate text-xs font-medium md:inline">
              This is a beta: report issues in our{' '}
              <span className="text-primary">Discord</span>
            </span>
          </a>
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

          {/* Copy the live preview URL */}
          <IconButton label="Copy preview URL" onClick={copyPreviewUrl}>
            <LinkIcon className="h-4 w-4" />
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

        </div>
      </div>

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
