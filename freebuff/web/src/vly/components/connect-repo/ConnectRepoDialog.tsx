'use client'

import { api } from '@/convex/_generated/api'
import { useAction, useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/vly/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { Input } from '@/vly/components/ui/input'
import { Textarea } from '@/vly/components/ui/textarea'
import {
  AlertTriangle,
  Building2,
  Github,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'

type Repo = {
  name: string
  full_name: string
  owner: string
  private: boolean
  description: string | null
  html_url: string
  default_branch: string
  permission_push: boolean
}

export function ConnectRepoDialog({
  open,
  onOpenChange,
  projectBasePath = '/web/project',
  returnUrl = '/web?connectRepo=1',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Base path projects are opened under after connecting. */
  projectBasePath?: string
  /** URL GitHub OAuth redirects back to (re-opens the dialog). */
  returnUrl?: string
}) {
  const router = useRouter()

  const status = useQuery(
    api.github.auth.connections.getGitHubConnectionStatus,
    open ? {} : 'skip',
  )
  const initiateGitHubAuth = useAction(api.github.auth.oauth.initiateGitHubAuth)
  const listRepos = useAction(api.github.cloudRepos.listConnectableRepositories)
  const getConfigureUrl = useAction(
    api.github.cloudRepos.getGitHubAppConfigureUrl,
  )
  const connectRepo = useAction(api.cloud.connectRepo.connectRepo)

  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [installLogin, setInstallLogin] = useState<string | null>(null)
  const [manageUrl, setManageUrl] = useState<string | null>(null)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Repo | null>(null)
  const [initialMessage, setInitialMessage] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connectionStatus = status?.status ?? 'not_connected'
  const isAppInstalled = connectionStatus === 'app_installed'

  const handleAuthorize = async () => {
    setError(null)
    try {
      // initiateGitHubAuth runs OAuth then forwards to the GitHub App install
      // screen. From `user_identified` GitHub auto-approves OAuth and lands the
      // user straight on the install/permissions page.
      const url = await initiateGitHubAuth({ returnUrl })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleManageAccess = async () => {
    setError(null)
    try {
      const url = await getConfigureUrl({})
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleLoadRepos = async () => {
    setLoadingRepos(true)
    setError(null)
    try {
      const result = await listRepos({})
      setRepos(result.repos)
      setInstallLogin(result.installation?.account_login ?? null)
      setManageUrl(result.installation?.manage_url ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRepos(false)
    }
  }

  const handleApprovePermissions = async () => {
    setError(null)
    try {
      // Prefer the precise installation permission-update page; fall back to
      // the generic app install/configure page if we don't have it.
      const url = manageUrl ?? (await getConfigureUrl({}))
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleConnect = async () => {
    if (!selected) return
    setConnecting(true)
    setError(null)
    try {
      const result = await connectRepo({
        repoFullName: selected.full_name,
        defaultBranch: selected.default_branch,
        ...(initialMessage.trim()
          ? { initialMessage: initialMessage.trim() }
          : {}),
      })
      if (result.success) {
        onOpenChange(false)
        router.push(`${projectBasePath}/${result.semanticIdentifier}`)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }

  // Group repos by owner so org repos are easy to find.
  const grouped = useMemo(() => {
    const filtered = (repos ?? []).filter((r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()),
    )
    const byOwner = new Map<string, Repo[]>()
    for (const r of filtered) {
      const list = byOwner.get(r.owner) ?? []
      list.push(r)
      byOwner.set(r.owner, list)
    }
    return Array.from(byOwner.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
  }, [repos, search])

  // If the installation only has read access to every repo, the app's
  // permissions haven't been approved on this install yet (e.g. a stale
  // install predating the Contents: write upgrade). Prompt to approve.
  const allReadOnly =
    repos !== null && repos.length > 0 && repos.every((r) => !r.permission_push)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Connect a GitHub repo
          </DialogTitle>
          <DialogDescription>
            Freebuff Cloud clones your repo into a sandbox, gets the preview
            running, and lets you build on it with free models.
          </DialogDescription>
        </DialogHeader>

        {status === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : connectionStatus === 'not_connected' ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Authorize GitHub so Freebuff can read the repos you pick and
                commit changes on your behalf. You choose exactly which
                repositories the app can touch.
              </span>
            </div>
            <Button onClick={handleAuthorize} className="w-full">
              <Github className="mr-2 h-4 w-4" />
              Connect GitHub
            </Button>
          </div>
        ) : connectionStatus === 'user_identified' ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              GitHub is authorized
              {status?.github_username ? ` as ${status.github_username}` : ''}.
              Now install the Freebuff app on the repositories (or organization)
              you want to use.
            </p>
            <Button onClick={handleAuthorize} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Install the Freebuff app
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {repos === null ? (
              <Button
                onClick={handleLoadRepos}
                disabled={loadingRepos}
                className="w-full"
              >
                {loadingRepos ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading repositories…
                  </>
                ) : (
                  'Choose a repository'
                )}
              </Button>
            ) : (
              <>
                {allReadOnly && (
                  <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span className="text-foreground">
                        Freebuff only has{' '}
                        <span className="font-medium">read-only</span> access to
                        these repos, so it can&apos;t commit or push yet. Approve
                        the updated permissions on GitHub, then refresh.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleApprovePermissions}
                        className="h-7"
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Approve permissions on GitHub
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleLoadRepos}
                        disabled={loadingRepos}
                        className="h-7"
                      >
                        <RefreshCw
                          className={`mr-1.5 h-3.5 w-3.5 ${loadingRepos ? 'animate-spin' : ''}`}
                        />
                        Refresh
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {installLogin ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        Installed on{' '}
                        <span className="font-medium text-foreground">
                          {installLogin}
                        </span>
                      </span>
                    ) : (
                      'Repositories the Freebuff app can access'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleManageAccess}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Add repositories
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-1">
                  {grouped.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No repositories found. Use “Add repositories” to grant the
                      app access.
                    </p>
                  ) : (
                    grouped.map(([owner, ownerRepos]) => (
                      <div key={owner}>
                        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {owner}
                        </div>
                        {ownerRepos.map((repo) => {
                          const disabled = !repo.permission_push
                          return (
                            <button
                              key={repo.full_name}
                              type="button"
                              disabled={disabled}
                              onClick={() => setSelected(repo)}
                              className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm transition-colors ${
                                disabled
                                  ? 'cursor-not-allowed opacity-50'
                                  : 'hover:bg-accent'
                              } ${
                                selected?.full_name === repo.full_name
                                  ? 'bg-accent'
                                  : ''
                              }`}
                            >
                              <span className="flex items-center gap-1.5 font-medium">
                                {repo.name}
                                {repo.private && (
                                  <Lock className="h-3 w-3 text-muted-foreground" />
                                )}
                                {disabled && (
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    (read-only)
                                  </span>
                                )}
                              </span>
                              {repo.description && (
                                <span className="line-clamp-1 text-xs text-muted-foreground">
                                  {repo.description}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
                <Textarea
                  placeholder="Optional: what do you want to do first? (e.g. 'add a dark mode toggle')"
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  rows={2}
                />
                <Button
                  onClick={handleConnect}
                  disabled={!selected || connecting}
                  className="w-full"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting {selected?.name}…
                    </>
                  ) : selected ? (
                    `Connect ${selected.full_name}`
                  ) : (
                    'Select a repository'
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
