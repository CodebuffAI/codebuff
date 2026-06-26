'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ConnectRepoDialog } from '@/vly/components/connect-repo/ConnectRepoDialog'
import { AmbientBackdrop } from '@/vly/components/app-shell/AmbientBackdrop'
import { AppShell } from '@/vly/components/app-shell/AppShell'
import { LimitedSandboxBadge } from '@/vly/components/cloud/LimitedSandboxBadge'
import { Github, Loader2, Plus, GitBranch, ArrowUpRight } from 'lucide-react'

export default function CloudHome() {
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const router = useRouter()

  const projects = useQuery(
    api.project.getUserProjects,
    isAuthed ? {} : 'skip',
  )
  const connectedProjects = (projects ?? []).filter(
    (p) => (p as any).project_type === 'connected_repo',
  )

  const [isConnectOpen, setIsConnectOpen] = useState(false)

  // Re-open the dialog after returning from the GitHub OAuth/install redirect.
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('connectRepo') === '1'
    ) {
      setIsConnectOpen(true)
    }
  }, [])

  return (
    <AppShell
      ambient={<AmbientBackdrop />}
      brandName="Freebuff Cloud"
      brandHref="/cloud"
      contentClassName="px-4 sm:px-6"
      actions={isAuthed ? <LimitedSandboxBadge /> : null}
    >
      <div className="relative z-10 mx-auto w-full max-w-6xl pb-12 pt-14 sm:pb-20 sm:pt-24">
        <header className="mb-10">
          <div className="flex items-center gap-2">
            <img
              src="/logo-icon.png"
              alt="Freebuff"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <h1 className="lp-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Freebuff Cloud
            </h1>
            <span className="rounded-full border border-forest-bright/30 bg-forest/15 px-2 py-0.5 text-[11px] font-medium text-forest-bright">
              beta
            </span>
          </div>
          <p className="mt-2 max-w-md text-sm text-white/55">
            Connect any GitHub repo, get a cloud sandbox with a live preview, and
            build with free models.
          </p>
        </header>

        {!isAuthed ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-xl shadow-black/40">
            <p className="mb-4 text-sm text-white/60">
              Sign in to connect a repository.
            </p>
            <Link
              href="/login?callbackUrl=/cloud"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        ) : projects === undefined ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : connectedProjects.length === 0 ? (
          <button
            type="button"
            onClick={() => setIsConnectOpen(true)}
            className="group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-10 text-center shadow-xl shadow-black/30 transition-colors hover:border-forest-bright/40 hover:bg-muted/40 sm:p-14"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/50">
              <Github className="h-6 w-6 text-white/50 transition-colors group-hover:text-forest-bright" />
            </span>
            <span className="mt-1 text-sm font-medium text-white/85">
              Connect your first repository
            </span>
            <span className="text-xs text-white/45">
              Freebuff clones it, boots a sandbox, and helps you configure the
              preview.
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-white/45">
                Your repositories
              </h2>
              <button
                type="button"
                onClick={() => setIsConnectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                Connect repo
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {connectedProjects.map((project) => (
                <button
                  key={project._id}
                  type="button"
                  onClick={() =>
                    router.push(`/cloud/project/${project.semantic_identifier}`)
                  }
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:border-forest-bright/30 hover:bg-muted/40"
                >
                  <div className="flex w-full items-center gap-2">
                    <Github className="h-4 w-4 shrink-0 text-white/55" />
                    <span className="min-w-0 flex-1 truncate font-medium text-white">
                      {(project as any).repo_full_name ||
                        project.name ||
                        project.semantic_identifier}
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-white/30 transition-colors group-hover:text-forest-bright" />
                  </div>
                  <span className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-white/50">
                    <GitBranch className="h-3 w-3" />
                    {(project as any).current_branch ?? 'main'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConnectRepoDialog
        open={isConnectOpen}
        onOpenChange={setIsConnectOpen}
        projectBasePath="/cloud/project"
        returnUrl="/cloud?connectRepo=1"
      />
    </AppShell>
  )
}
