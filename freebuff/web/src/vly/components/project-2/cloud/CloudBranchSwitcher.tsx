'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useCallback, useEffect, useState } from 'react'
import {
  GitBranch,
  Check,
  Plus,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import { toast } from 'sonner'

/**
 * GitHub-Desktop-style branch indicator + switcher for Freebuff Cloud. Shows
 * the current branch, warns when the user is working directly on the default
 * branch, and lets them switch / create branches. Branch ops run server-side
 * (git inside the sandbox); commits / PRs are handled by the agent.
 */
export function CloudBranchSwitcher({
  semanticIdentifier,
  fallbackBranch,
  defaultBranch: defaultBranchProp,
  compact = false,
}: {
  semanticIdentifier: string
  fallbackBranch?: string | null
  defaultBranch?: string | null
  compact?: boolean
}) {
  const getGitStatus = useAction(api.cloud.git.getGitStatus)
  const switchBranch = useAction(api.cloud.git.switchBranch)
  const createBranch = useAction(api.cloud.git.createBranch)

  const [currentBranch, setCurrentBranch] = useState<string>(
    fallbackBranch ?? 'main',
  )
  const [defaultBranch, setDefaultBranch] = useState<string | null>(
    defaultBranchProp ?? null,
  )
  const [branches, setBranches] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBranch, setNewBranch] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const status = await getGitStatus({ semanticIdentifier })
      setCurrentBranch(status.currentBranch)
      setDefaultBranch(status.defaultBranch)
      setBranches(status.branches)
      setIsDirty(status.isDirty)
      setLoaded(true)
    } catch {
      // Sandbox may be cold; keep the fallback label.
    } finally {
      setLoading(false)
    }
  }, [getGitStatus, semanticIdentifier])

  // Lazy-load: only hit the sandbox (git) when the user opens the switcher, so
  // we don't wake the sandbox on every page load. The label + on-main warning
  // come from props until then.
  useEffect(() => {
    if (open && !loaded) void refresh()
  }, [open, loaded, refresh])

  const onMain =
    defaultBranch != null && currentBranch === defaultBranch

  const handleSwitch = async (branch: string) => {
    if (branch === currentBranch) return
    setBusy(true)
    try {
      const result = await switchBranch({ semanticIdentifier, branch })
      if (result.success) {
        setCurrentBranch(result.currentBranch)
        toast.success(result.message)
        setOpen(false)
        void refresh()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch branch')
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    const name = newBranch.trim()
    if (!name) return
    setBusy(true)
    try {
      const result = await createBranch({ semanticIdentifier, branch: name })
      if (result.success) {
        setCurrentBranch(result.currentBranch)
        toast.success(result.message)
        setNewBranch('')
        setCreating(false)
        setOpen(false)
        void refresh()
      } else {
        toast.error(result.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create branch')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex h-7 max-w-[200px] items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
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
          {busy || loading ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          ) : null}
          {isDirty && !compact && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              title="Uncommitted changes"
            />
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
            aria-label="Refresh branches"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </DropdownMenuLabel>

        {onMain && (
          <div className="mx-1 mb-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
            You're working on{' '}
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
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="new-branch-name"
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy || !newBranch.trim()}
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
  )
}
