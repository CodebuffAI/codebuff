'use client'

import { api } from '@/convex/_generated/api'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  installation_id: number
  pushed_at: string | null
}

type Installation = {
  installation_id: number
  account_login: string
  account_type?: string
  contents_permission?: string
  can_write: boolean
  manage_url: string
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
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth()

  const status = useQuery(
    api.github.auth.connections.getGitHubConnectionStatus,
    open && isAuthenticated ? {} : 'skip',
  )
  // Instant DB-backed cache; the dialog renders from this immediately.
  const cache = useQuery(
    api.github.repoCacheStore.getCachedConnectableRepositories,
    open && isAuthenticated ? {} : 'skip',
  )
  const initiateGitHubAuth = useAction(api.github.auth.oauth.initiateGitHubAuth)
  const refreshRepos = useAction(
    api.github.cloudRepos.refreshConnectableRepositories,
  )
  const getConfigureUrl = useAction(
    api.github.cloudRepos.getGitHubAppConfigureUrl,
  )
  const connectRepo = useAction(api.cloud.connectRepo.connectRepo)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Repo | null>(null)
  const [initialMessage, setInitialMessage] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoTried = useRef(false)

  const connectionStatus = status?.status ?? 'not_connected'
  const isAppInstalled = connectionStatus === 'app_installed'

  const repos: Repo[] | null = cache?.repos ?? null
  const installations: Installation[] = cache?.installations ?? []

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      await refreshRepos({})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [refreshRepos])

  // When the dialog opens and the app is installed, show cached repos
  // immediately and only hit GitHub if we've never cached anything yet.
  useEffect(() => {
    if (!open) {
      autoTried.current = false
      return
    }
    if (isAppInstalled && cache === null && !autoTried.current) {
      autoTried.current = true
      void handleRefresh()
    }
  }, [open, isAppInstalled, cache, handleRefresh])

  const handleAuthorize = async () => {
    setError(null)
    if (!isAuthenticated) {
      setError('Sign in before connecting GitHub.')
      return
    }
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
    if (!isAuthenticated) {
      setError('Sign in before managing GitHub access.')
      return
    }
    try {
      // Pass returnUrl so GitHub's post-install callback comes back to /cloud
      // (or wherever the dialog lives) instead of the default /web.
      const url = await getConfigureUrl({ returnUrl })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleApprovePermissions = (manageUrl: string) => {
    setError(null)
    window.open(manageUrl, '_blank', 'noopener,noreferrer')
  }

  const handleConnect = async () => {
    if (!selected) return
    setConnecting(true)
    setError(null)
    try {
      const result = await connectRepo({
        repoFullName: selected.full_name,
        defaultBranch: selected.default_branch,
        installationId: selected.installation_id,
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

  // Client-side filter on owner/repo, sorted most-recently-pushed first.
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (repos ?? [])
      .filter((r) => r.full_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = a.pushed_at ? Date.parse(a.pushed_at) : 0
        const tb = b.pushed_at ? Date.parse(b.pushed_at) : 0
        return tb - ta
      })
  }, [repos, search])

  // Installations whose app grant is still read-only (Contents not write yet).
  const readOnlyInstallations = useMemo(
    () => installations.filter((i) => !i.can_write),
    [installations],
  )

  // Show the in-flight spinner only before we have anything to render.
  const showInitialLoading =
    isAppInstalled && repos === null && (cache === undefined || refreshing)

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

        {isConvexAuthLoading || (open && isAuthenticated && status === undefined) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>Sign in to connect GitHub.</p>
            <Button
              onClick={() =>
                router.push(
                  `/login?callbackUrl=${encodeURIComponent(returnUrl)}`,
                )
              }
            >
              Sign in
            </Button>
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
        ) : showInitialLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading repositories…
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {readOnlyInstallations.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span className="text-foreground">
                    Freebuff has <span className="font-medium">read-only</span>{' '}
                    access on{' '}
                    {readOnlyInstallations.map((i) => i.account_login).join(', ')}
                    , so it can&apos;t commit or push there yet. Approve the
                    Contents: write permission for each, then refresh.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {readOnlyInstallations.map((inst) => (
                    <Button
                      key={inst.installation_id}
                      size="sm"
                      onClick={() => handleApprovePermissions(inst.manage_url)}
                      className="h-7"
                    >
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                      Approve {inst.account_login}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {installations.length > 0
                  ? `Installed on ${installations.map((i) => i.account_login).join(', ')}`
                  : 'Repositories the Freebuff app can access'}
              </span>
              <button
                type="button"
                onClick={handleManageAccess}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add repositories
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh repositories from GitHub"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {repos && repos.length === 0
                    ? 'No repositories found. Use “Add repositories” to grant the app access.'
                    : 'No repositories match your search.'}
                </p>
              ) : (
                filtered.map((repo) => {
                  const disabled = !repo.permission_push
                  return (
                    <button
                      key={`${repo.installation_id}:${repo.full_name}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelected(repo)}
                      className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:bg-accent'
                      } ${
                        selected?.full_name === repo.full_name &&
                        selected?.installation_id === repo.installation_id
                          ? 'bg-accent'
                          : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        {repo.full_name}
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
                })
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
