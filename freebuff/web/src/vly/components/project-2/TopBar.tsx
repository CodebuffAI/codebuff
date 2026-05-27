'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  Menu,
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
        className="flex h-11 w-full items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur-xl"
        style={{ contain: 'layout style paint' }}
      >
        {/* ── Left: project dropdown ───────────────────────────────────── */}
        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex max-w-[280px] items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus:bg-muted focus:outline-none"
                aria-label="Project menu"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-card">
                  <img
                    src="/freebuff-icon.svg"
                    alt="Freebuff"
                    className="h-5 w-5 object-contain"
                  />
                </span>
                <span className="min-w-0 truncate text-foreground/90">
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
        <div className="flex items-center gap-0.5">
          {/* Preview - opens in new tab */}
          <IconButton
            label="Open preview in new tab"
            onClick={openPreviewInNewTab}
          >
            <Eye className="h-4 w-4" />
          </IconButton>

          {/* Share - opens invite dialog */}
          <InviteDialog projectId={project._id}>
            <button
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Share"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden md:inline">Share</span>
            </button>
          </InviteDialog>

          {/* Publish - primary CTA */}
          <button
            className="ml-1 flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_0_18px_rgba(124,255,63,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setDeployDialogOpen(true)}
            disabled={isPublishing}
            aria-label="Publish"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            <span>{isPublishing ? 'Publishing…' : 'Publish'}</span>
          </button>
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
