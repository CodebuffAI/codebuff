'use client'

import { api } from '@/convex/_generated/api'
import { useAction, useMutation } from 'convex/react'
import { useCallback, useEffect, useState } from 'react'
import {
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Github,
  RefreshCw,
  Loader2,
  AlertTriangle,
  FileDiff,
  Download,
} from 'lucide-react'
import { CloudBranchSwitcher } from './CloudBranchSwitcher'
import { toast } from 'sonner'

/**
 * Git actions surface for Freebuff Cloud. Lightweight branch ops run directly
 * against the sandbox; anything that touches history (commit, push, PR) is
 * delegated to the agent by firing a chat prompt, so the agent owns the full
 * workflow (writing commit messages, opening PRs via `gh`, etc.).
 */
export function CloudGitPanel({
  semanticIdentifier,
  repoFullName,
  fallbackBranch,
  onAfterPrompt,
}: {
  semanticIdentifier: string
  repoFullName?: string | null
  fallbackBranch?: string | null
  onAfterPrompt?: () => void
}) {
  const getGitStatus = useAction(api.cloud.git.getGitStatus)
  const sendMessage = useMutation(
    api.coding_agent.cli_agent.trigger.saveMessageAndStartWorkflow,
  )

  const [currentBranch, setCurrentBranch] = useState(fallbackBranch ?? 'main')
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  const [changedFiles, setChangedFiles] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const status = await getGitStatus({ semanticIdentifier })
      setCurrentBranch(status.currentBranch)
      setDefaultBranch(status.defaultBranch)
      setChangedFiles(status.changedFiles)
    } catch {
      // ignore — sandbox may be cold
    } finally {
      setLoading(false)
    }
  }, [getGitStatus, semanticIdentifier])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onMain = defaultBranch != null && currentBranch === defaultBranch

  const firePrompt = async (label: string, message: string) => {
    setSending(label)
    try {
      await sendMessage({
        projectSemanticIdentifier: semanticIdentifier,
        message,
        agentType: 'Freebuff',
      })
      toast.success(`Asked the agent to ${label.toLowerCase()}.`)
      onAfterPrompt?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${label}`)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Git</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Repo + branch status card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-sm text-foreground">
              {repoFullName ?? 'connected repository'}
            </span>
          </div>
          {repoFullName && (
            <a
              href={`https://github.com/${repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Open on GitHub
            </a>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CloudBranchSwitcher
            semanticIdentifier={semanticIdentifier}
            fallbackBranch={currentBranch}
            defaultBranch={defaultBranch}
          />
          <span className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
            <FileDiff className="h-3.5 w-3.5" />
            {changedFiles} uncommitted{' '}
            {changedFiles === 1 ? 'change' : 'changes'}
          </span>
        </div>

        {onMain && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You're working directly on{' '}
              <span className="font-mono font-semibold">{currentBranch}</span>.
              Consider creating a feature branch before committing changes.
            </span>
          </div>
        )}
      </div>

      {/* Agent-driven git actions */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Actions
        </p>
        <GitActionButton
          icon={<GitCommitHorizontal className="h-4 w-4" />}
          title="Commit & push"
          description="Stage all changes, write a commit message, and push to the current branch."
          loading={sending === 'commit and push'}
          onClick={() =>
            void firePrompt(
              'commit and push',
              `Stage all current changes, write a clear conventional commit message describing them, commit, and push to the "${currentBranch}" branch.`,
            )
          }
        />
        <GitActionButton
          icon={<GitPullRequest className="h-4 w-4" />}
          title="Open a pull request"
          description="Commit & push the current branch, then open a PR with a summary using gh."
          loading={sending === 'open a pull request'}
          onClick={() =>
            void firePrompt(
              'open a pull request',
              `Commit and push my current changes on "${currentBranch}", then open a GitHub pull request into "${
                defaultBranch ?? 'the default branch'
              }" using the gh CLI. Write a concise PR title and a description summarizing the changes.`,
            )
          }
        />
        <GitActionButton
          icon={<Download className="h-4 w-4" />}
          title="Pull latest"
          description="Pull the latest changes for the current branch from the remote."
          loading={sending === 'pull latest'}
          onClick={() =>
            void firePrompt(
              'pull latest',
              `Pull the latest changes for the "${currentBranch}" branch from the remote and resolve any straightforward conflicts.`,
            )
          }
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Commits, pushes, and PRs are handled by the agent so it can write
        messages and resolve issues. Watch the chat for progress.
      </p>
    </div>
  )
}

function GitActionButton({
  icon,
  title,
  description,
  loading,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-60"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}
