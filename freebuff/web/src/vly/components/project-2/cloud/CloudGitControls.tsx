'use client'

import { api } from '@/convex/_generated/api'
import { useAction, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Check,
  Plus,
  Loader2,
  AlertTriangle,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Upload,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { toast } from 'sonner'

// Auto-refresh the sandbox-backed status at most once per mount, and only when
// the cached snapshot is missing or older than this. Steady-state cost is zero
// sandbox calls: the cached status is served by a cheap reactive Convex query.
const STALE_MS = 45_000

type GitStatus = {
  currentBranch: string
  defaultBranch: string | null
  branches: string[]
  isDirty: boolean
  changedFiles: number
  insertions: number
  deletions: number
  ahead: number
  behind: number
  hasUpstream: boolean
  behindDefault: number
  repoFullName: string | null
  updatedAt: number
}

/**
 * Compact, efficient git section for the Freebuff Cloud top bar. Renders branch
 * state, uncommitted changes (files + line stats), ahead/behind, and icon
 * actions (commit, push, sync, open PR). All display reads come from a cached
 * reactive query so rendering never wakes the sandbox; only explicit actions or
 * a single stale-on-mount refresh hit the sandbox.
 */
export function CloudGitControls({
  semanticIdentifier,
  fallbackBranch,
  defaultBranch: defaultBranchProp,
  repoFullName,
}: {
  semanticIdentifier: string
  fallbackBranch?: string | null
  defaultBranch?: string | null
  repoFullName?: string | null
}) {
  const cached = useQuery(api.cloud.connectRepoMutations.getCachedGitStatus, {
    semanticIdentifier,
  }) as GitStatus | null | undefined

  const getGitStatus = useAction(api.cloud.git.getGitStatus)
  const switchBranch = useAction(api.cloud.git.switchBranch)
  const createBranch = useAction(api.cloud.git.createBranch)
  const commitChanges = useAction(api.cloud.git.commitChanges)
  const pushCurrentBranch = useAction(api.cloud.git.pushCurrentBranch)
  const syncFromRemote = useAction(api.cloud.git.syncFromRemote)
  const createPullRequest = useAction(api.cloud.git.createPullRequest)

  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [commitMessage, setCommitMessage] = useState('')

  // Derived view model — prefer the live cache, fall back to props before the
  // first refresh lands.
  const currentBranch = cached?.currentBranch ?? fallbackBranch ?? 'main'
  const defaultBranch = cached?.defaultBranch ?? defaultBranchProp ?? null
  const branches = cached?.branches ?? []
  const isDirty = cached?.isDirty ?? false
  const changedFiles = cached?.changedFiles ?? 0
  const insertions = cached?.insertions ?? 0
  const deletions = cached?.deletions ?? 0
  const ahead = cached?.ahead ?? 0
  const behind = cached?.behind ?? 0
  const behindDefault = cached?.behindDefault ?? 0
  const onMain = defaultBranch != null && currentBranch === defaultBranch

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await getGitStatus({ semanticIdentifier })
    } catch {
      // Sandbox may be cold; cached values remain on screen.
    } finally {
      setRefreshing(false)
    }
  }, [getGitStatus, semanticIdentifier])

  // One-shot stale check on mount. Fires at most once and only when needed.
  const didAutoRefresh = useRef(false)
  useEffect(() => {
    if (didAutoRefresh.current) return
    if (cached === undefined) return // query still loading
    didAutoRefresh.current = true
    const stale = cached === null || Date.now() - cached.updatedAt > STALE_MS
    if (stale) void refresh()
  }, [cached, refresh])

  const runAction = useCallback(
    async (
      label: string,
      action: () => Promise<{ success: boolean; message: string }>,
    ) => {
      if (busy) return
      setBusy(label)
      try {
        const result = await action()
        if (result.success) toast.success(result.message)
        else toast.error(result.message)
        // Cache is refreshed server-side by the action; the reactive query
        // updates the UI with no extra call.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to ${label}`)
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const handleSwitch = async (branch: string) => {
    if (branch === currentBranch) {
      setBranchOpen(false)
      return
    }
    setBranchOpen(false)
    await runAction('switch branch', () =>
      switchBranch({ semanticIdentifier, branch }),
    )
  }

  const handleCreateBranch = async () => {
    const name = newBranch.trim()
    if (!name) return
    setNewBranch('')
    setCreating(false)
    setBranchOpen(false)
    await runAction('create branch', () =>
      createBranch({ semanticIdentifier, branch: name }),
    )
  }

  const handleCommit = async () => {
    const message = commitMessage.trim()
    if (!message) return
    setCommitMessage('')
    setCommitOpen(false)
    await runAction('commit', () =>
      commitChanges({ semanticIdentifier, message }),
    )
  }

  const handlePush = () =>
    runAction('push', () => pushCurrentBranch({ semanticIdentifier }))

  const handleSync = () =>
    runAction('sync', () => syncFromRemote({ semanticIdentifier }))

  const handleCreatePr = async () => {
    if (busy) return
    setBusy('open pull request')
    try {
      const result = await createPullRequest({ semanticIdentifier })
      if (result.success) {
        toast.success(result.message)
        if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open pull request')
    } finally {
      setBusy(null)
    }
  }

  const anyBusy = busy != null

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Branch switcher */}
      <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`flex h-7 max-w-[150px] items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors sm:max-w-[180px] ${
              onMain
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                : 'border-border bg-muted/40 text-foreground/85 hover:bg-muted hover:text-foreground'
            }`}
            aria-label="Switch branch"
          >
            {onMain ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate font-mono">{currentBranch}</span>
            {isDirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                title="Uncommitted changes"
              />
            )}
            {(busy === 'switch branch' || busy === 'create branch') && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-64 rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/40"
        >
          <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            Branches
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                void refresh()
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Refresh git status"
            >
              <RotateCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </DropdownMenuLabel>

          {onMain && (
            <div className="mx-1 mb-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
              You're on{' '}
              <span className="font-mono font-semibold">{currentBranch}</span>.
              Create a branch before making changes.
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch}
                className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onSelect={(e) => {
                  e.preventDefault()
                  void handleSwitch(branch)
                }}
              >
                <span className="mr-2 flex h-4 w-4 items-center justify-center">
                  {branch === currentBranch && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
                <span className="truncate font-mono text-xs">{branch}</span>
                {branch === defaultBranch && (
                  <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    default
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="bg-border/60" />

          {creating ? (
            <div className="flex items-center gap-1.5 p-1.5">
              <input
                autoFocus
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateBranch()
                  if (e.key === 'Escape') setCreating(false)
                }}
                placeholder="new-branch-name"
                className="h-7 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void handleCreateBranch()}
                disabled={!newBranch.trim()}
                className="flex h-7 items-center rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Create
              </button>
            </div>
          ) : (
            <DropdownMenuItem
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
              onSelect={(e) => {
                e.preventDefault()
                setCreating(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
              New branch from {currentBranch}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status cluster: detailed on md+, dirty/ahead/behind kept terse */}
      <div className="hidden items-center gap-1.5 md:flex">
        {isDirty ? (
          <span
            className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={`${changedFiles} uncommitted ${changedFiles === 1 ? 'file' : 'files'}`}
          >
            <span className="font-medium text-foreground/80">{changedFiles}</span>
            {(insertions > 0 || deletions > 0) && (
              <span className="font-mono">
                <span className="text-emerald-400">+{insertions}</span>{' '}
                <span className="text-rose-400">-{deletions}</span>
              </span>
            )}
          </span>
        ) : (
          cached != null && (
            <span
              className="flex items-center gap-1 rounded-md px-1 text-[11px] text-muted-foreground/70"
              title="Working tree clean"
            >
              <Check className="h-3 w-3" />
            </span>
          )
        )}

        {(ahead > 0 || behind > 0) && (
          <span className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {ahead > 0 && (
              <span className="flex items-center" title={`${ahead} to push`}>
                <ArrowUp className="h-3 w-3" />
                {ahead}
              </span>
            )}
            {behind > 0 && (
              <span className="flex items-center" title={`${behind} to pull`}>
                <ArrowDown className="h-3 w-3" />
                {behind}
              </span>
            )}
          </span>
        )}

        {!onMain && behindDefault > 0 && (
          <span
            className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-200"
            title={`${behindDefault} commits behind ${defaultBranch}`}
          >
            {behindDefault} behind {defaultBranch}
          </span>
        )}
      </div>

      {/* Action icon buttons */}
      <div className="flex items-center">
        {/* Commit (popover with message) */}
        <DropdownMenu open={commitOpen} onOpenChange={setCommitOpen}>
          <DropdownMenuTrigger asChild>
            <GitIconButton
              label="Commit changes"
              disabled={!isDirty || anyBusy}
              loading={busy === 'commit'}
            >
              <GitCommitHorizontal className="h-4 w-4" />
            </GitIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-72 rounded-xl border border-border bg-popover p-2 shadow-2xl shadow-black/40"
          >
            <p className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Commit {changedFiles} {changedFiles === 1 ? 'file' : 'files'}
            </p>
            <input
              autoFocus
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCommit()
              }}
              placeholder="Commit message"
              className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={!commitMessage.trim()}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <GitCommitHorizontal className="h-3.5 w-3.5" />
              Commit
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Push */}
        <GitIconButton
          label={ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? '' : 's'}` : 'Push'}
          onClick={() => void handlePush()}
          disabled={anyBusy}
          loading={busy === 'push'}
        >
          <span className="relative">
            <Upload className="h-4 w-4" />
            {ahead > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground">
                {ahead}
              </span>
            )}
          </span>
        </GitIconButton>

        {/* Sync (pull) */}
        <GitIconButton
          label={behind > 0 ? `Pull ${behind} commit${behind === 1 ? '' : 's'}` : 'Sync from remote'}
          onClick={() => void handleSync()}
          disabled={anyBusy}
          loading={busy === 'sync'}
        >
          <span className="relative">
            <ArrowDown className="h-4 w-4" />
            {behind > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[8px] font-bold leading-none text-black">
                {behind}
              </span>
            )}
          </span>
        </GitIconButton>

        {/* Open pull request */}
        <GitIconButton
          label={onMain ? 'Create a branch to open a PR' : 'Open pull request'}
          onClick={() => void handleCreatePr()}
          disabled={onMain || anyBusy}
          loading={busy === 'open pull request'}
        >
          <GitPullRequest className="h-4 w-4" />
        </GitIconButton>
      </div>
    </div>
  )
}

function GitIconButton({
  children,
  label,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
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
