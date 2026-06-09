'use client'

import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useRouter } from 'next/navigation'
import { useState, Suspense, lazy } from 'react'
import {
  Loader,
  AlertTriangle,
  ArrowUpRight,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { useCustomer } from '@/vly/lib/billing-disabled-react'
import { checkProjectWorkspaceQuota } from '@/vly/lib/billing/workspace-quota-utils'
import type { AutumnCustomer } from '@/vly/lib/billing/types'
import { SearchInput } from '@/vly/components/ui/search-input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/vly/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import { HeroStorageProvider } from '@/vly/hooks/useSharedHeroStorage'
import { DocumentInput } from '@/vly/components/test-landing/DocumentInput'
import { AppShell } from '@/vly/components/app-shell/AppShell'
import { getExternalPreviewUrl } from '@/vly/lib/project-preview-url'

const ThemePickerModal = lazy(
  () => import('@/vly/components/ThemePickerModal'),
)

type AnyProject = NonNullable<
  FunctionReturnType<typeof api.project.getUserProjects>
>[number]

function getProjectImageSrc(project: AnyProject): string | null {
  const p = project as any
  if (p.screenshotUrl) return p.screenshotUrl
  if (
    p.pretty_preview_url &&
    p.pretty_preview_url.startsWith('http') &&
    !p.pretty_preview_url.includes('freebuff.dev') &&
    (p.pretty_preview_url.includes('.jpg') ||
      p.pretty_preview_url.includes('.jpeg') ||
      p.pretty_preview_url.includes('.png') ||
      p.pretty_preview_url.includes('.gif') ||
      p.pretty_preview_url.includes('.webp') ||
      p.pretty_preview_url.startsWith('data:image/'))
  ) {
    return p.pretty_preview_url
  }
  return null
}

function isLegacyProject(project: AnyProject): boolean {
  const p = project as any
  return p.sandbox_id && !p.sandbox_id.startsWith('daytona:')
}

export default function ProjectsDashboard() {
  const { status: sessionStatus } = useSession()
  const projects = useQuery(api.project.getUserProjects)
  const isLoadingProjects =
    sessionStatus === 'loading' || projects === undefined
  const router = useRouter()
  const { customer } = useCustomer()

  const [deleteProjectId, setDeleteProjectId] = useState<Id<'project'> | null>(
    null,
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'lastViewed' | 'alphabetical'>(
    'lastViewed',
  )
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false)
  const [loadingProjectId, setLoadingProjectId] =
    useState<Id<'project'> | null>(null)

  const deleteProject = useMutation(api.project.deleteProject)
  const updateLastOpened = useMutation(api.project.updateLastOpened)

  const filteredProjects =
    projects
      ?.filter(
        (project) =>
          project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.semantic_identifier
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()),
      )
      .sort((a, b) => {
        if (sortBy === 'alphabetical') {
          return (a.name || '').localeCompare(b.name || '')
        }
        const aTime = a.last_opened ?? 0
        const bTime = b.last_opened ?? 0
        return bTime - aTime
      }) || []

  const projectCount = projects?.length ?? 0

  const openProject = (project: AnyProject) => {
    if (loadingProjectId === project._id) return
    setLoadingProjectId(project._id)
    updateLastOpened({
      semanticIdentifier: project.semantic_identifier,
    }).catch((error: any) => {
      console.error('Failed to update last opened timestamp:', error)
    })
    router.push(`/web/project/${project.semantic_identifier}`)
  }

  return (
    <AppShell>
      {/* ── Freebuff-y ambient background (primary-color glow + grid) ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[460px] overflow-hidden"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% -10%, hsl(var(--primary) / 0.18), transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--primary) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {/* ── Prompt-first composer — the primary "create" path ──────── */}
        <section className="mb-12">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-['Geist'] text-3xl font-normal leading-tight text-foreground sm:text-4xl">
              What do you want to build?
            </h2>
          </div>
          <div className="mx-auto mt-7 max-w-3xl">
            <HeroStorageProvider>
              <DocumentInput setIsThemePickerOpen={setIsThemePickerOpen} />
              <Suspense fallback={null}>
                {isThemePickerOpen && (
                  <ThemePickerModal
                    isOpen={isThemePickerOpen}
                    onClose={() => setIsThemePickerOpen(false)}
                  />
                )}
              </Suspense>
            </HeroStorageProvider>
          </div>
        </section>

        {/* ── Your projects ──────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-2.5">
              <h3 className="font-['Geist'] text-lg font-semibold text-foreground">
                Your projects
              </h3>
              {!isLoadingProjects && projectCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {projectCount}
                </span>
              )}
            </div>

            {projectCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
                  <SearchInput
                    placeholder="Search projects…"
                    onSearch={(term) => setSearchTerm(term)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-lg bg-muted/40 px-3 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground">
                      <span className="hidden font-medium sm:inline">
                        {sortBy === 'lastViewed' ? 'Last viewed' : 'A–Z'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-44 rounded-lg border-0 bg-popover/95 p-1 text-popover-foreground shadow-lg shadow-black/30 backdrop-blur"
                  >
                    <DropdownMenuItem
                      onClick={() => setSortBy('lastViewed')}
                      className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/85 focus:bg-muted focus:text-foreground"
                    >
                      Last viewed
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortBy('alphabetical')}
                      className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/85 focus:bg-muted focus:text-foreground"
                    >
                      Alphabetical
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {isLoadingProjects ? (
            <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-2xl bg-muted/30 p-3"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted/40">
                    <div className="absolute inset-0 animate-pulse bg-muted/30" />
                  </div>
                  <div className="flex flex-col gap-2 px-1 pb-1">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProjects.length > 0 ? (
            <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => {
                const isOpening = loadingProjectId === project._id
                const previewUrl = getExternalPreviewUrl(project)
                const quotaCheck = checkProjectWorkspaceQuota(
                  project,
                  customer as AutumnCustomer | null | undefined,
                )
                const imageSrc = getProjectImageSrc(project)
                return (
                  <div
                    key={project._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProject(project)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openProject(project)
                      }
                    }}
                    className="group flex cursor-pointer flex-col gap-3 rounded-2xl bg-muted/25 p-3 outline-none ring-0 transition-all duration-200 hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-primary/60"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted/40">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={project.name || 'Project preview'}
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted/45">
                          <div className="rounded-md bg-background/65 px-3 py-2 text-center">
                            <div className="text-xs font-medium text-muted-foreground">
                              Preview will appear after next deploy
                            </div>
                          </div>
                        </div>
                      )}

                      {isOpening && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                          <Loader className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      )}

                      {/* Action overlay — always visible on touch, hover on ≥lg */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-background/75 p-2 opacity-100 backdrop-blur-sm transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100">
                        {previewUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              updateLastOpened({
                                semanticIdentifier: project.semantic_identifier,
                              }).catch(() => {})
                              window.open(previewUrl, '_blank')
                            }}
                            className="pointer-events-auto flex h-8 items-center gap-1 rounded-md bg-background/85 px-2.5 text-xs font-medium text-foreground/90 backdrop-blur hover:bg-background"
                            aria-label="Open preview in new tab"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteProjectId(project._id)
                          }}
                          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground backdrop-blur transition-colors hover:bg-destructive/15 hover:text-destructive"
                          aria-label="Delete project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 px-1 pb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-['Geist'] text-base font-semibold leading-tight text-foreground">
                          {project.name || 'Untitled Project'}
                        </h3>
                        {isLegacyProject(project) && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                            title="Legacy CodeSandbox project"
                          >
                            Legacy
                          </span>
                        )}
                        {!quotaCheck.allowed && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                            title={
                              quotaCheck.reason || 'Workspace tier exceeds plan'
                            }
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Upgrade
                          </span>
                        )}
                      </div>
                      <p className="font-['Geist'] text-xs text-muted-foreground">
                        Viewed{' '}
                        {project.last_opened
                          ? new Date(project.last_opened).toLocaleDateString()
                          : project._creationTime
                            ? new Date(
                                project._creationTime,
                              ).toLocaleDateString()
                            : 'recently'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : searchTerm ? (
            <div className="flex min-h-[260px] w-full items-center justify-center">
              <div className="w-full max-w-xl rounded-3xl bg-muted/25 px-8 py-10 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  No match
                </p>
                <h3 className="mt-3 font-['Geist'] text-2xl font-normal leading-none text-foreground sm:text-3xl">
                  No projects found
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Nothing matched &quot;{searchTerm}&quot;. Try a different name.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] w-full items-center justify-center">
              <div className="w-full max-w-2xl rounded-2xl border border-border/50 bg-muted/20 px-8 py-12 text-center">
                <div className="flex flex-col items-center">
                  <h3 className="mt-5 font-['Geist'] text-2xl font-normal leading-none text-foreground sm:text-3xl">
                    No projects yet
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    Use the composer above to describe your first app.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteProjectId}
        onOpenChange={() => setDeleteProjectId(null)}
      >
        <AlertDialogContent className="rounded-2xl border-0 bg-card/95 text-foreground backdrop-blur sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-['Geist'] text-2xl font-normal leading-tight text-foreground">
              Delete project
            </AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            Are you sure you want to delete this project? This action cannot be
            undone.
          </p>
          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteProjectId(null)}
              className="rounded-lg bg-muted/50 px-4 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <AlertDialogAction
              onClick={async () => {
                if (deleteProjectId) {
                  try {
                    await deleteProject({ projectId: deleteProjectId })
                    setDeleteProjectId(null)
                  } catch (error) {
                    console.error('Failed to delete project:', error)
                  }
                }
              }}
              className="rounded-lg border-0 bg-destructive/15 text-destructive hover:bg-destructive/25"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
