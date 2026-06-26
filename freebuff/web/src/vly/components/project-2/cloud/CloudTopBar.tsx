'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  Eye,
  Users,
  Settings,
  Home,
  LogOut,
  Rocket,
  Github,
  User,
  Link as LinkIcon,
} from 'lucide-react'
import { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { InviteDialog } from '../InviteDialog'
import { EditableProjectName } from '../EditableProjectName'
import { BetaBadge } from '@/vly/components/app-shell/BetaBadge'
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
import { useAction } from 'convex/react'
import { signOut } from 'next-auth/react'
import { getExternalPreviewUrl } from '@/vly/lib/project-preview-url'
import { CloudGitControls } from './CloudGitControls'
import { LimitedSandboxBadge } from '@/vly/components/cloud/LimitedSandboxBadge'

/**
 * Cloud-only top bar. Forked from the shared web TopBar so Freebuff Cloud can
 * own its own chrome: routes Home/Settings to `/cloud`, shows the GitHub-Desktop
 * branch switcher inline, and publishes via the connected-repo cloud flow.
 */
export function CloudTopBar({
  project,
}: {
  project: FunctionReturnType<typeof api.project.getProjectData>
}) {
  const triggerConnectedRepoPublish = useAction(
    (api as any).cloud.publish.triggerConnectedRepoPublish,
  )
  const router = useRouter()
  const [isCloudPublishing, setIsCloudPublishing] = useState(false)

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
    router.push(`/cloud/project/${project.semantic_identifier}/settings`)
  }

  const triggerCloudPublish = async () => {
    if (!project?.semantic_identifier || isCloudPublishing) return
    try {
      setIsCloudPublishing(true)
      await triggerConnectedRepoPublish({
        semanticIdentifier: project.semantic_identifier,
      })
      toast.success('Cloud publish queued')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to queue cloud publish'
      toast.error(message)
    } finally {
      setIsCloudPublishing(false)
    }
  }

  if (!project) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex h-11 w-full items-center justify-between gap-1.5 border-b border-border/60 bg-background/95 px-2 backdrop-blur-xl sm:gap-2 sm:px-3"
        style={{ contain: 'layout style paint' }}
      >
        {/* ── Left: project dropdown + branch switcher ─────────────────── */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex max-w-[180px] items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus:bg-muted focus:outline-none sm:max-w-[260px] md:max-w-[320px]"
                aria-label="Project menu"
              >
                <img
                  src="/logo-icon.png"
                  alt="Freebuff"
                  className="h-6 w-6 flex-shrink-0 object-contain"
                />
                <BetaBadge className="hidden sm:inline-flex" />
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground/90">
                  {project.name ||
                    project.semantic_identifier ||
                    'Untitled project'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-64 rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/40"
            >
              <div className="px-2 py-2">
                <EditableProjectName project={project} />
              </div>
              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => router.push('/cloud')}
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

              {project.repo_full_name && (
                <DropdownMenuItem
                  className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                  onClick={() =>
                    window.open(
                      `https://github.com/${project.repo_full_name}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Github className="mr-2.5 h-4 w-4 text-muted-foreground" />
                  Open on GitHub
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-border/60" />

              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => router.push('/web/settings')}
              >
                <User className="mr-2.5 h-4 w-4 text-muted-foreground" />
                User settings
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

          {project.semantic_identifier && (
            <CloudGitControls
              semanticIdentifier={project.semantic_identifier}
              fallbackBranch={project.current_branch}
              defaultBranch={project.repo_default_branch}
              repoFullName={project.repo_full_name}
            />
          )}
        </div>

        {/* ── Right: icon actions ──────────────────────────────────────── */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <LimitedSandboxBadge />
          <IconButton
            label="Open preview in new tab"
            onClick={openPreviewInNewTab}
          >
            <Eye className="h-4 w-4" />
          </IconButton>

          <IconButton label="Copy preview URL" onClick={copyPreviewUrl}>
            <LinkIcon className="h-4 w-4" />
          </IconButton>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <InviteDialog projectId={project._id}>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground sm:px-2.5"
                    aria-label="Project members"
                  >
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Members</span>
                  </button>
                </InviteDialog>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            >
              Project members
            </TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={() => {
              void triggerCloudPublish()
            }}
            disabled={isCloudPublishing}
            className="ml-0.5 flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 sm:ml-1 sm:px-3"
            aria-label="Publish"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isCloudPublishing ? 'Publishing...' : 'Publish'}
            </span>
          </button>
        </div>
      </div>
    </TooltipProvider>
  )
}

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
