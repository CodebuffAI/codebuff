'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileDiff,
  Loader2,
  RotateCw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'

type DiffLine = {
  kind: 'add' | 'del' | 'hunk' | 'context'
  text: string
}

type DiffFile = {
  path: string
  oldPath: string | null
  status: 'added' | 'deleted' | 'renamed' | 'modified'
  binary: boolean
  additions: number
  deletions: number
  lines: DiffLine[]
}

/**
 * Parse raw `git diff` output into per-file sections. Only needs to be robust
 * enough for display: file boundaries, status detection, and +/- coloring.
 */
function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let inHunks = false

  const lines = raw.split(/\r?\n/)
  // Drop the artifact of the diff's trailing newline; real context lines are
  // always space-prefixed, never fully empty.
  if (lines[lines.length - 1] === '') lines.pop()

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      // Greedy match so the last " b/" wins; paths containing " b/" are rare
      // and the ---/+++ lines below correct the path anyway.
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
      current = {
        path: m?.[2] ?? line.slice('diff --git '.length),
        oldPath: null,
        status: 'modified',
        binary: false,
        additions: 0,
        deletions: 0,
        lines: [],
      }
      files.push(current)
      inHunks = false
      continue
    }
    if (!current) continue

    if (!inHunks) {
      if (line.startsWith('@@')) {
        inHunks = true
        current.lines.push({ kind: 'hunk', text: line })
      } else if (line.startsWith('new file')) {
        current.status = 'added'
      } else if (line.startsWith('deleted file')) {
        current.status = 'deleted'
      } else if (line.startsWith('rename from ')) {
        current.status = 'renamed'
        current.oldPath = line.slice('rename from '.length)
      } else if (line.startsWith('rename to ')) {
        current.path = line.slice('rename to '.length)
      } else if (line.startsWith('Binary files')) {
        current.binary = true
      } else if (line.startsWith('--- a/')) {
        // Git appends a tab to ---/+++ paths that contain spaces.
        current.path = line.slice('--- a/'.length).replace(/\t+$/, '')
      } else if (line.startsWith('+++ b/')) {
        current.path = line.slice('+++ b/'.length).replace(/\t+$/, '')
      }
      continue
    }

    if (line.startsWith('@@')) {
      current.lines.push({ kind: 'hunk', text: line })
    } else if (line.startsWith('+')) {
      current.additions++
      current.lines.push({ kind: 'add', text: line })
    } else if (line.startsWith('-')) {
      current.deletions++
      current.lines.push({ kind: 'del', text: line })
    } else {
      current.lines.push({ kind: 'context', text: line })
    }
  }

  return files
}

const LINE_CLASSES: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-500/10 text-emerald-300',
  del: 'bg-rose-500/10 text-rose-300',
  hunk: 'bg-sky-500/5 text-sky-300/80',
  context: 'text-foreground/60',
}

const STATUS_LABELS: Record<DiffFile['status'], string | null> = {
  added: 'new',
  deleted: 'deleted',
  renamed: 'renamed',
  modified: null,
}

/**
 * Modal diff viewer for uncommitted changes in a Freebuff Cloud project.
 * Fetches the working-tree diff from the sandbox on open (one action call);
 * nothing runs while the dialog is closed.
 */
export function CloudGitDiffDialog({
  open,
  onOpenChange,
  semanticIdentifier,
  currentBranch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  semanticIdentifier: string
  currentBranch: string
}) {
  const getGitDiff = useAction(api.cloud.git.getGitDiff)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ diff: string; truncated: boolean } | null>(
    null,
  )
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getGitDiff({ semanticIdentifier })
      setData(result)
      setCollapsed(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load diff')
    } finally {
      setLoading(false)
    }
  }, [getGitDiff, semanticIdentifier])

  // Fetch fresh on every open; stale data from a previous open is discarded.
  useEffect(() => {
    if (open) {
      setData(null)
      void load()
    }
  }, [open, load])

  const files = useMemo(
    () => (data ? parseUnifiedDiff(data.diff) : []),
    [data],
  )
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  const toggleFile = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileDiff className="h-4 w-4 text-muted-foreground" />
            Uncommitted changes
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {currentBranch}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Refresh diff"
            >
              <RotateCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {files.length > 0 ? (
              <>
                {files.length} {files.length === 1 ? 'file' : 'files'} changed
                {(totalAdditions > 0 || totalDeletions > 0) && (
                  <span className="font-mono">
                    {' '}
                    · <span className="text-emerald-400">+{totalAdditions}</span>{' '}
                    <span className="text-rose-400">-{totalDeletions}</span>
                  </span>
                )}
              </>
            ) : (
              'Diff of your working tree against the last commit.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && data == null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading diff from sandbox…
            </div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-sm text-rose-400">
              {error}
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No uncommitted changes.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {files.map((file, index) => {
                const isCollapsed = collapsed.has(index)
                const statusLabel = STATUS_LABELS[file.status]
                return (
                  <div key={`${file.path}-${index}`}>
                    <button
                      type="button"
                      onClick={() => toggleFile(index)}
                      className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-border/40 bg-popover px-3 py-1.5 text-left hover:bg-muted/50"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-mono text-xs text-foreground/90">
                        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                      </span>
                      {statusLabel && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                          {statusLabel}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 font-mono text-[11px]">
                        {file.additions > 0 && (
                          <span className="text-emerald-400">
                            +{file.additions}
                          </span>
                        )}{' '}
                        {file.deletions > 0 && (
                          <span className="text-rose-400">-{file.deletions}</span>
                        )}
                      </span>
                    </button>
                    {!isCollapsed &&
                      (file.binary ? (
                        <p className="px-3 py-2 text-xs italic text-muted-foreground">
                          Binary file — no text diff available.
                        </p>
                      ) : (
                        <div className="overflow-x-auto py-1">
                          {file.lines.map((line, i) => (
                            <div
                              key={i}
                              className={`whitespace-pre px-3 font-mono text-[11px] leading-5 ${LINE_CLASSES[line.kind]}`}
                            >
                              {line.text || ' '}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                )
              })}
              {data?.truncated && (
                <p className="px-3 py-2 text-xs italic text-muted-foreground">
                  Diff truncated — it exceeds the display limit.
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
