import { UserButton } from '@/vly/components/auth/UserButton'

import { useCommunityBadgeTierSync } from '@/vly/hooks/useCommunityBadgeTierSync'
import { CommunityBadge } from '@/vly/components/community/CommunityBadge'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { useMutation } from 'convex/react'

import { FunctionReturnType } from 'convex/server'
import {
  File,
  Github,
  History,
  Home,
  Key,
  Plug,
  Plus,
  Code,
  Headset,
  Activity,
  Table,
  FileStack,
  Package,
  Users,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Smartphone,
  GitBranch,
  Workflow,
  Download,
  Cpu,
  Building2,
  LayoutTemplate,
  Palette,
  HardDrive,
} from 'lucide-react'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { Input } from '@/vly/components/ui/input'
import { Button } from '@/vly/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import { ActiveView } from '../pages/project-2'
import { GodModeActions } from './GodModeActions'
import { GravityAdSlot } from './agent-chat/GravityAdSlot'

// Separate component for user section with badge sync
function UserSectionWithBadge() {
  const communityBadgeTier = useCommunityBadgeTierSync()

  return (
    <div className="flex w-full min-w-0 items-center justify-start gap-2 overflow-hidden">
      <UserButton />
      {communityBadgeTier > 0 && (
        <CommunityBadge communityBadgeTier={communityBadgeTier} size="sm" />
      )}
    </div>
  )
}

interface LeftSidebarProps {
  activeView: ActiveView
  setActiveView?: (view: ActiveView) => void
  project: FunctionReturnType<typeof api.project.getProjectData>
  entryPoints: FunctionReturnType<typeof api.project.getEntryPoints>
  activeEntryPoint: Id<'entry_point'> | null
  setActiveEntryPoint: (id: Id<'entry_point'>) => void
  syncStatus?: FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >
  onSendMessage?: (message: string) => void
}

export function LeftSidebar({
  activeView,
  project,
  entryPoints,
  activeEntryPoint,
  syncStatus,
  onSendMessage,
}: LeftSidebarProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const semanticIdentifier = typeof params.id === 'string' ? params.id : ''

  // Helper function to create URL with search params
  const createHref = (view?: string, page?: string) => {
    const newSearchParams = new URLSearchParams(searchParams.toString())

    if (view !== undefined) {
      if (view === 'default') {
        newSearchParams.delete('view')
      } else {
        newSearchParams.set('view', view)
      }
    }

    if (page !== undefined) {
      newSearchParams.set('page', page)
    }

    // If switching to non-default view, remove page param
    if (view && view !== 'default') {
      newSearchParams.delete('page')
    }

    const queryString = newSearchParams.toString()
    return queryString
      ? `/web/project/${semanticIdentifier}?${queryString}`
      : `/web/project/${semanticIdentifier}`
  }
  const deleteEntryPoint = useMutation(api.entry_point.deleteEntryPoint)
  const editPage = useMutation(api.entry_point.editPageTitleOrRouteURL)
  const [editModal, setEditModal] = useState<{
    open: boolean
    id: Id<'entry_point'> | null
    title: string
    url: string
    resolved: string
    hasDynamic: boolean
  }>({
    open: false,
    id: null,
    title: '',
    url: '',
    resolved: '',
    hasDynamic: false,
  })

  const [createPageDialog, setCreatePageDialog] = useState<{
    open: boolean
    query: string
  }>({
    open: false,
    query: '',
  })

  // Coming Soon section state
  const [isComingSoonExpanded, setIsComingSoonExpanded] = useState(false)
  const [comingSoonFeatureDialog, setComingSoonFeatureDialog] = useState<{
    open: boolean
    feature: string | null
  }>({
    open: false,
    feature: null,
  })

  // Coming soon features data
  const comingSoonFeatures = [
    {
      id: 'templates',
      title: 'Pro Templates',
      icon: LayoutTemplate,
      shortDesc: 'Start with pre-built templates to fast-forward your project',
      marketingTitle: 'Launch Faster with Pro Templates',
      marketingDesc:
        'Skip the boilerplate and get a head start with professionally designed templates. From SaaS dashboards to e-commerce stores, our templates give you a production-ready foundation in seconds.',
      benefits: [
        'Dozens of ready-to-use app templates',
        'Full-stack templates with backend included',
        'Customizable designs and layouts',
        'Best practices built-in from day one',
      ],
    },
    {
      id: 'internal-apps',
      title: 'Internal Apps',
      icon: Building2,
      shortDesc:
        'Build internal apps that integrate directly into your existing system',
      marketingTitle: 'Build Powerful Internal Tools',
      marketingDesc:
        'Create custom internal applications that seamlessly integrate with your existing infrastructure. Build admin dashboards, employee portals, inventory systems, and more—all without the complexity of traditional development.',
      benefits: [
        'Connect to your existing databases and APIs',
        'Role-based access control built-in',
        'Deploy instantly within your organization',
        'No infrastructure management required',
      ],
    },
    {
      id: 'mobile-apps',
      title: 'Mobile Apps',
      icon: Smartphone,
      shortDesc: 'Create native mobile apps and release them to the app store',
      marketingTitle: 'Go Mobile in Minutes',
      marketingDesc:
        'Transform your web application into native iOS and Android apps. Generate App Store and Play Store ready builds with a single click, complete with push notifications and offline support.',
      benefits: [
        'Native iOS and Android builds',
        'Push notification support',
        'Offline-first architecture',
        'One-click App Store submission',
      ],
    },
    {
      id: 'workflow-visualizer',
      title: 'Workflow Visualizer',
      icon: Workflow,
      shortDesc: 'Visualize backend workflows and build backend flows reliably',
      marketingTitle: 'See Your Backend in Action',
      marketingDesc:
        'Visualize complex backend workflows with an intuitive node-based editor. Debug issues faster by tracing data flow, and build reliable backend logic with visual programming.',
      benefits: [
        'Visual flow debugging',
        'Real-time execution tracing',
        'Drag-and-drop workflow builder',
        'Automatic error detection',
      ],
    },
    {
      id: 'import-github',
      title: 'Import from GitHub',
      icon: Download,
      shortDesc:
        'Import from an existing GitHub repo and work on them directly in vly',
      marketingTitle: 'Bring Your Existing Projects',
      marketingDesc:
        "Import any GitHub repository and continue development in vly's AI-powered environment. Maintain your existing codebase while gaining access to all of vly's powerful features.",
      benefits: [
        'One-click repository import',
        'Preserve commit history',
        'Sync changes bidirectionally',
        'AI understands your existing code',
      ],
    },
    {
      id: 'parallel-branching',
      title: 'Parallel Gen & Branching',
      icon: GitBranch,
      shortDesc: 'Run multi-agent systems and manage branches',
      marketingTitle: 'Supercharge Development with AI Agents',
      marketingDesc:
        'Run multiple AI agents in parallel to explore different solutions simultaneously. Create feature branches instantly and merge the best approaches—all managed automatically.',
      benefits: [
        'Multiple parallel AI generations',
        'Automatic branch management',
        'Compare and merge solutions',
        'Intelligent conflict resolution',
      ],
    },
    {
      id: 'claude-codex',
      title: 'Claude Code, Codex',
      icon: Cpu,
      shortDesc: 'Run Claude Code, Codex, and other powerful models',
      marketingTitle: 'Access the Most Powerful AI Models',
      marketingDesc:
        'Unlock the full potential of cutting-edge AI models like Claude Code and OpenAI Codex. Get smarter suggestions, better code generation, and more sophisticated reasoning for complex tasks.',
      benefits: [
        'Access to premium AI models',
        'Enhanced code understanding',
        'Complex reasoning capabilities',
        'Specialized coding assistance',
      ],
    },
  ]

  const editingEntryPoint = useMemo(
    () => entryPoints.find((ep) => ep._id === editModal.id),
    [entryPoints, editModal.id],
  )

  const getActiveAccentClass = (view: ActiveView) => {
    if (
      view === 'database' ||
      view === 'backend management' ||
      view === 'monitoring'
    ) {
      return 'dark:shadow-[inset_2px_0_0_rgba(201,176,122,0.9)]'
    }
    if (
      view === 'editor' ||
      view === 'versions' ||
      view === 'assets' ||
      view === 'github'
    ) {
      return 'dark:shadow-[inset_2px_0_0_rgba(156,179,198,0.9)]'
    }
    if (
      view === 'integrations' ||
      view === 'keys' ||
      view === 'ui components'
    ) {
      return 'dark:shadow-[inset_2px_0_0_rgba(150,192,179,0.9)]'
    }
    if (view === 'app & support' || view === 'hire developers') {
      return 'dark:shadow-[inset_2px_0_0_rgba(208,186,143,0.9)]'
    }
    return 'dark:shadow-[inset_2px_0_0_rgba(168,197,147,0.9)]'
  }

  const getButtonStyle = (view: ActiveView) => {
    return `self-stretch p-1 flex justify-start items-center gap-2 rounded transition-all duration-200 cursor-pointer transform-gpu ${
      activeView === view
        ? `bg-slate-200 dark:bg-[#282828] dark:outline dark:outline-1 dark:outline-[#3c3c3c] ${getActiveAccentClass(view)}`
        : 'hover:bg-slate-100/50 hover:translate-x-0.5 will-change-transform dark:hover:bg-[#282828]/90 dark:hover:outline dark:hover:outline-1 dark:hover:outline-[#343434]'
    }`
  }

  const getPageItemStyle = (isPageActive: boolean) => {
    const baseStyle =
      'self-stretch p-1 flex justify-start items-center gap-2 rounded transition-all duration-200 cursor-pointer transform-gpu'
    if (isPageActive && activeView === 'default') {
      return `${baseStyle} bg-slate-200 dark:bg-[#282828] dark:outline dark:outline-1 dark:outline-[#3c3c3c] ${getActiveAccentClass('default')}`
    }
    return `${baseStyle} hover:bg-slate-100/50 hover:translate-x-0.5 will-change-transform dark:hover:bg-[#282828]/90 dark:hover:outline dark:hover:outline-1 dark:hover:outline-[#343434]`
  }

  const user = useSignedInUser()
  const userRole = user?.role

  // Helper function to get status dot color and style
  const getSyncStatusDot = () => {
    if (!syncStatus) return null

    const status = syncStatus.sync_status
    let dotColor = ''
    let pulseClass = ''

    switch (status) {
      case 'synced':
        dotColor = 'bg-green-500'
        break
      case 'pending':
        dotColor = 'bg-yellow-500'
        pulseClass = 'animate-pulse'
        break
      case 'error':
        dotColor = 'bg-red-500'
        break
      case 'conflict':
        dotColor = 'bg-orange-500'
        pulseClass = 'animate-pulse'
        break
      default:
        return null
    }

    return (
      <div
        className={`ml-auto h-2 w-2 rounded-full ${dotColor} ${pulseClass}`}
        title={`Sync status: ${status}`}
      />
    )
  }

  return (
    <div className="h-full w-[200px] overflow-y-auto overflow-x-hidden bg-slate-50 shadow-[0_0_20px_0_rgba(45,45,45,0.18)] dark:border-r dark:border-[#343434] dark:bg-[linear-gradient(180deg,#1f2020_0%,#232323_48%,#1f2020_100%)] dark:shadow-[20px_0_44px_-14px_rgba(0,0,0,0.98)]">
      <div className="flex h-full w-full flex-col items-end justify-start gap-4 px-4 py-4">
        {/* Gravity ad at top of sidebar */}
        {project && (
          <div className="w-full">
            <GravityAdSlot
              messages={[]}
              sessionId={project._id}
              slotKey="sidebar-top"
              variant="compact"
              placement="sidebar"
            />
          </div>
        )}
        {/* Pages Section */}
        <div className="flex flex-col items-start justify-start gap-3 self-stretch">
          <div className="flex items-center justify-between self-stretch">
            <div className="text-xs font-semibold text-zinc-800 dark:text-[#a8c593]">
              Pages
            </div>
            <button
              onClick={() => setCreatePageDialog({ open: true, query: '' })}
              className="rounded p-0.5 transition-colors hover:bg-slate-200 dark:hover:bg-[#282828]"
              aria-label="Create new page"
              title="Create new page"
            >
              <Plus className="h-3 w-3 text-zinc-800" />
            </button>
          </div>

          <div className="flex flex-col items-start justify-start gap-1 self-stretch">
            {entryPoints.map((entryPoint, idx) => (
              <Link
                key={entryPoint._id}
                href={createHref('default', entryPoint._id)}
                className={
                  getPageItemStyle(activeEntryPoint === entryPoint._id) +
                  ' group'
                }
              >
                {idx === 0 ? (
                  <Home className="h-3 w-3 text-zinc-800" />
                ) : (
                  <File className="h-3 w-3 text-zinc-800" />
                )}
                <div className="text-xs font-normal text-zinc-800">
                  {entryPoint.page?.page_title ?? 'Untitled'}
                </div>
                <div className="pointer-events-none ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  {entryPoint.page?.page_display_url !== '/' && (
                    <>
                      <button
                        className="rounded p-0.5 text-zinc-500 hover:bg-slate-100 hover:text-zinc-700 dark:hover:bg-[#282828]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditModal({
                            open: true,
                            id: entryPoint._id,
                            title: entryPoint.page?.page_title ?? '',
                            url: entryPoint.page?.page_display_url ?? '',
                            resolved:
                              entryPoint.page?.resolved_display_url ?? '',
                            hasDynamic: !!entryPoint.page?.has_dynamic_params,
                          })
                        }}
                        aria-label="Edit page"
                        title="Edit page"
                      >
                        <Pencil className="h-3 w-3 text-zinc-700" />
                      </button>
                      <button
                        className="rounded p-0.5 text-zinc-400 hover:bg-slate-100 hover:text-zinc-600 dark:hover:bg-[#282828]"
                        onClick={(e) => {
                          e.stopPropagation()
                          const name = entryPoint.page?.page_title ?? 'Untitled'
                          const route = entryPoint.page?.page_display_url
                            ? ` (${entryPoint.page.page_display_url})`
                            : ''
                          if (
                            confirm(
                              `Are you sure you want to delete "${name}"${route}? This cannot be undone.`,
                            )
                          ) {
                            deleteEntryPoint({ entryPointId: entryPoint._id })
                          }
                        }}
                        aria-label="Delete page"
                        title="Delete page"
                      >
                        <Trash2 className="h-3 w-3 text-zinc-400" />
                      </button>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="self-stretch border-t-2 border-stone-300 dark:border-[#575757]"></div>

        {/* Tools Section */}
        <div className="flex flex-col items-start justify-start gap-3 self-stretch">
          <div className="flex flex-col items-start justify-start gap-1 self-stretch">
            {/* Backend Section */}
            <div className="flex flex-col gap-1 self-stretch">
              <div className="pt-1 text-xs font-semibold text-zinc-800 dark:text-[#cbb084]">
                Backend
              </div>
              <Link href={createHref('database')}>
                <div className={getButtonStyle('database')}>
                  <Table className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">Data</div>
                </div>
              </Link>
              <Link href={createHref('backend management')}>
                <div className={getButtonStyle('backend management')}>
                  <FileStack className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">Logs</div>
                </div>
              </Link>
              <Link href={createHref('monitoring')}>
                <div className={getButtonStyle('monitoring')}>
                  <Activity className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">Usage</div>
                </div>
              </Link>
            </div>

            {/* Workspace Section */}
            <div className="flex flex-col gap-1 self-stretch">
              <div className="pt-1 text-xs font-semibold text-zinc-800 dark:text-[#aeb9c3]">
                Workspace
              </div>
              <Link href={createHref('editor')}>
                <div className={getButtonStyle('editor')}>
                  <Code className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    Editor
                  </div>
                </div>
              </Link>
              <Link href={createHref('versions')}>
                <div className={getButtonStyle('versions')}>
                  <History className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    Versions
                  </div>
                </div>
              </Link>
              <Link href={createHref('assets')}>
                <div className={getButtonStyle('assets')}>
                  <Package className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    Assets
                  </div>
                </div>
              </Link>
              <Link href={createHref('github')}>
                <div className={getButtonStyle('github')}>
                  <Github className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    Sync to GitHub
                  </div>
                  {getSyncStatusDot()}
                </div>
              </Link>
            </div>

            {/* Integrations Section */}
            <div className="flex flex-col gap-1 self-stretch">
              <div className="pt-1 text-xs font-semibold text-zinc-800 dark:text-[#9fc4ba]">
                Integrations
              </div>
              <Link href={createHref('integrations')}>
                <div className={getButtonStyle('integrations')}>
                  <Plug className="h-3 w-3 text-zinc-800" />
                  <div className="inline-flex items-center gap-1 text-xs font-normal text-zinc-800">
                    Library
                    <span className="rounded-full border border-green-200 bg-green-100 px-1.5 py-0 text-[10px] font-medium text-green-700">
                      New
                    </span>
                  </div>
                </div>
              </Link>
              <Link href={createHref('keys')}>
                <div className={getButtonStyle('keys')}>
                  <Key className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">Keys</div>
                </div>
              </Link>
              <Link href={createHref('ui components')}>
                <div className={getButtonStyle('ui components')}>
                  <Palette className="h-3 w-3 text-zinc-800" />
                  <div className="inline-flex items-center gap-1 text-xs font-normal text-zinc-800">
                    UI Components
                    <span className="rounded-full border border-green-200 bg-green-100 px-1.5 py-0 text-[10px] font-medium text-green-700">
                      New
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Services Section */}
            <div className="flex flex-col gap-1 self-stretch">
              <div className="pt-1 text-xs font-semibold text-zinc-800 dark:text-[#c9b48e]">
                Services
              </div>
              <Link href={createHref('app & support')}>
                <div className={getButtonStyle('app & support')}>
                  <Headset className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    App and Support
                  </div>
                </div>
              </Link>
              <Link href={createHref('hire developers')}>
                <div className={getButtonStyle('hire developers')}>
                  <Users className="h-3 w-3 text-blue-600" />
                  <div className="inline-flex items-center gap-1 text-xs font-normal text-zinc-800">
                    Hire Developers
                    <span className="rounded-full border border-green-200 bg-green-100 px-1.5 py-0 text-[10px] font-medium text-green-700">
                      New
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {userRole === 'god' && project?.sandbox_id && (
          <>
            <GodModeActions isExpanded={true} project={project} />
            <div className="mt-2 flex flex-col items-start justify-start gap-3 self-stretch">
              <div className="flex items-center justify-between self-stretch">
                <div className="text-xs font-semibold text-zinc-800 dark:text-[#c7c09a]">
                  Developer
                </div>
              </div>
              <div className="flex flex-col items-start justify-start gap-1 self-stretch">
                <Link href={createHref('daytona fs')}>
                  <div className={getButtonStyle('daytona fs')}>
                    <HardDrive className="h-3 w-3 text-amber-700" />
                    <div className="text-xs font-normal text-amber-800">
                      Daytona FS
                    </div>
                  </div>
                </Link>
                <Link
                  href="/web/devtools"
                  className={getButtonStyle('default') + ' flex items-center'}
                >
                  <File className="h-3 w-3 text-zinc-800" />
                  <div className="text-xs font-normal text-zinc-800">
                    Workflow Inspector
                  </div>
                </Link>
              </div>
            </div>
          </>
        )}

        {/* Coming Soon to Pro Section */}
        <div className="flex flex-col items-start justify-start gap-2 self-stretch">
          <button
            onClick={() => setIsComingSoonExpanded(!isComingSoonExpanded)}
            className="flex w-full items-center justify-between rounded p-1 transition-colors hover:bg-slate-100/50 dark:hover:bg-[#282828]/90"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-500 dark:text-[#b9a5cc]" />
              <span className="text-xs font-semibold text-purple-700 dark:text-[#c5b2d8]">
                Coming Soon to Pro
              </span>
            </div>
            {isComingSoonExpanded ? (
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-zinc-500" />
            )}
          </button>

          <AnimatePresence>
            {isComingSoonExpanded && (
              <motion.div
                className="flex flex-col gap-0.5 self-stretch overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1] as const,
                }}
              >
                {comingSoonFeatures.map((feature) => {
                  const Icon = feature.icon
                  const isNowLive = feature.id === 'claude-codex'
                  return (
                    <button
                      key={feature.id}
                      onClick={() =>
                        setComingSoonFeatureDialog({
                          open: true,
                          feature: feature.id,
                        })
                      }
                      className="group flex w-full items-start gap-2 rounded p-1.5 text-left transition-all hover:bg-purple-50/50 dark:hover:bg-[#282828]"
                    >
                      <Icon className="mt-0.5 h-3 w-3 flex-shrink-0 text-purple-400 transition-colors group-hover:text-purple-600" />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-zinc-700 transition-colors group-hover:text-purple-700">
                            {feature.title}
                          </span>
                          {isNowLive && (
                            <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                              Now Live!
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] leading-tight text-zinc-400">
                          {feature.shortDesc}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer to push user section to bottom */}
        <div className="flex-1"></div>

        {/* Compact User Section at Bottom */}
        <UserSectionWithBadge />
      </div>

      {/* Edit Page Modal */}
      <Dialog
        open={editModal.open}
        onOpenChange={(open) => setEditModal((s) => ({ ...s, open }))}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-sm">Edit page</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-700">Title</label>
            <Input
              value={editModal.title}
              onChange={(e) =>
                setEditModal((s) => ({ ...s, title: e.target.value }))
              }
              placeholder="Page title"
            />
            <label className="mt-2 text-xs text-zinc-700">URL</label>
            <Input
              value={editModal.url}
              onChange={(e) =>
                setEditModal((s) => ({ ...s, url: e.target.value }))
              }
              placeholder="/path or full URL"
            />
            <label className="mt-2 text-xs text-zinc-700">
              Concrete URL (optional)
            </label>
            <Input
              value={editModal.resolved}
              onChange={(e) =>
                setEditModal((s) => ({ ...s, resolved: e.target.value }))
              }
              placeholder="Full URL to use for dynamic routes"
            />
            <div className="text-[10px] text-zinc-500">
              Path cannot be edited. Dynamic routes should use a concrete URL.
            </div>
            <div className="mt-3 space-y-1 rounded bg-slate-50 p-2">
              <div className="text-[10px] text-zinc-500">
                Path:{' '}
                <span className="font-mono text-[10px] text-zinc-700">
                  {editingEntryPoint?.page?.page_file ?? ''}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500">
                Has dynamic params:{' '}
                <span className="text-[10px] text-zinc-700">
                  {editingEntryPoint?.page?.has_dynamic_params ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500">
                Current route:{' '}
                <span className="font-mono text-[10px] text-zinc-700">
                  {editingEntryPoint?.page?.page_display_url ?? ''}
                </span>
              </div>
              {editingEntryPoint?.page?.resolved_display_url ? (
                <div className="text-[10px] text-zinc-500">
                  Resolved URL:{' '}
                  <span className="font-mono text-[10px] text-zinc-700">
                    {editingEntryPoint?.page?.resolved_display_url}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditModal((s) => ({ ...s, open: false }))}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!editModal.id) return
                await editPage({
                  entryPointId: editModal.id,
                  new_title: editModal.title || undefined,
                  dynamic_data: editModal.url || undefined,
                  resolved_display_url: editModal.resolved || undefined,
                })
                setEditModal({
                  open: false,
                  id: null,
                  title: '',
                  url: '',
                  resolved: '',
                  hasDynamic: false,
                })
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Page Dialog */}
      <Dialog
        open={createPageDialog.open}
        onOpenChange={(open) => setCreatePageDialog((s) => ({ ...s, open }))}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-sm">Create a new page</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-700">
              Describe the page you want to create
            </label>
            <Input
              value={createPageDialog.query}
              onChange={(e) =>
                setCreatePageDialog((s) => ({ ...s, query: e.target.value }))
              }
              placeholder="e.g., a contact form page with email validation"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createPageDialog.query.trim()) {
                  e.preventDefault()
                  if (onSendMessage) {
                    const message = `Create a new page: \n<user_query>\n${createPageDialog.query}\n</user_query>`
                    onSendMessage(message)
                    setCreatePageDialog({ open: false, query: '' })
                  }
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCreatePageDialog({ open: false, query: '' })}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (createPageDialog.query.trim() && onSendMessage) {
                  const message = `Create a new page: \n<user_query>\n${createPageDialog.query}\n</user_query>`
                  onSendMessage(message)
                  setCreatePageDialog({ open: false, query: '' })
                }
              }}
              disabled={!createPageDialog.query.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coming Soon Feature Dialog */}
      <Dialog
        open={comingSoonFeatureDialog.open}
        onOpenChange={(open) =>
          setComingSoonFeatureDialog((s) => ({ ...s, open }))
        }
      >
        <DialogContent
          onClick={(e) => e.stopPropagation()}
          className="max-w-md"
        >
          {(() => {
            const feature = comingSoonFeatures.find(
              (f) => f.id === comingSoonFeatureDialog.feature,
            )
            if (!feature) return null
            const Icon = feature.icon
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg">
                        {feature.marketingTitle}
                      </DialogTitle>
                      <p className="text-xs text-purple-600">
                        Coming Soon to Pro
                      </p>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm leading-relaxed text-zinc-600">
                    {feature.marketingDesc}
                  </p>
                  <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-700">
                      What you'll get
                    </h4>
                    <ul className="space-y-2">
                      {feature.benefits.map((benefit, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm text-zinc-700"
                        >
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-purple-500" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3 text-center">
                    <p className="text-xs leading-relaxed text-purple-700">
                      💜 Your Pro subscription directly accelerates feature
                      development. We don't profit—your support keeps vly alive
                      and shipping fast!
                    </p>
                  </div>
                </div>
                <DialogFooter className="mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setComingSoonFeatureDialog({ open: false, feature: null })
                    }
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    className="border border-purple-300 bg-[rgb(233,213,255)] text-purple-700 hover:bg-purple-200"
                    onClick={() => {
                      setComingSoonFeatureDialog({
                        open: false,
                        feature: null,
                      })
                      // Could navigate to billing page here
                      window.location.href = '/web/dashboard'
                    }}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Get Pro Access
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
