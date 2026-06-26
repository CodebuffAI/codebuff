'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ConnectRepoDialog } from '@/vly/components/connect-repo/ConnectRepoDialog'
import { AmbientBackdrop } from '@/vly/components/app-shell/AmbientBackdrop'
import { AppShell } from '@/vly/components/app-shell/AppShell'
import { LimitedSandboxBadge } from '@/vly/components/cloud/LimitedSandboxBadge'
import { CloudFeedbackDialog } from '@/vly/components/cloud/CloudFeedbackDialog'
import { Github, Loader2, Plus, GitBranch, ArrowUpRight, MessageCircle } from 'lucide-react'

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
      <div className="relative z-10 mx-auto w-full max-w-4xl pb-0 pt-20 sm:pt-32">
        {/* Hero header */}
        <header className="mb-14 sm:mb-16">
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
          <p className="mt-3 max-w-lg text-base text-white/55">
            Connect any GitHub repo, get a cloud sandbox with a live preview,
            and build with free models.
          </p>
        </header>

        {/* Main content */}
        {!isAuthed ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-xl shadow-black/40 sm:p-16">
            <p className="mb-5 text-sm text-white/60">
              Sign in to connect a repository.
            </p>
            <Link
              href="/login?callbackUrl=/cloud"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        ) : projects === undefined ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : connectedProjects.length === 0 ? (
          <button
            type="button"
            onClick={() => setIsConnectOpen(true)}
            className="group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xl shadow-black/30 transition-colors hover:border-forest-bright/40 hover:bg-muted/40 sm:p-20"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <Github className="h-7 w-7 text-white/50 transition-colors group-hover:text-forest-bright" />
            </span>
            <span className="mt-1 text-base font-medium text-white/85">
              Connect your first repository
            </span>
            <span className="text-sm text-white/45">
              Freebuff clones it, boots a sandbox, and helps you configure the
              preview.
            </span>
          </button>
        ) : (
          <div className="space-y-5">
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

        {/* Feedback survey prompt */}
        <div className="mt-20 flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-4 sm:mt-28">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">
              Shape the future of Freebuff Cloud
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              We read every response. Takes under a minute.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="https://discord.gg/yXG3w7wxfs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Discord
            </Link>
            <CloudFeedbackDialog
              triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-bright/90"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-4xl px-0 pb-10 pt-16 sm:pt-20">
        <div className="border-t border-white/[0.07] pt-10">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <Image
                  src="/logo-icon.png"
                  alt="Freebuff"
                  width={22}
                  height={22}
                  className="rounded-md"
                />
                <span className="font-serif text-sm tracking-widest text-white/80">
                  freebuff
                </span>
              </div>
              <p className="mt-2 text-xs text-white/40">
                The free coding agent
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                Links
              </h3>
              <nav className="flex flex-col gap-2">
                {[
                  { href: '/cli', label: 'CLI' },
                  { href: '/blog', label: 'Blog' },
                  { href: 'https://codebuff.com', label: 'Codebuff', external: true },
                  { href: 'https://github.com/CodebuffAI/codebuff', label: 'GitHub', external: true },
                  { href: 'https://discord.gg/yXG3w7wxfs', label: 'Discord', external: true },
                ].map(({ href, label, external }) => (
                  <Link
                    key={label}
                    href={href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-xs text-white/45 transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                Legal
              </h3>
              <nav className="flex flex-col gap-2">
                <Link
                  href="https://codebuff.com/privacy-policy"
                  className="text-xs text-white/45 transition-colors hover:text-white"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="https://codebuff.com/terms-of-service"
                  className="text-xs text-white/45 transition-colors hover:text-white"
                >
                  Terms of Service
                </Link>
                <span className="mt-1 text-xs text-white/30">
                  © {new Date().getFullYear()} Freebuff
                </span>
              </nav>
            </div>
          </div>
        </div>
      </footer>

      <ConnectRepoDialog
        open={isConnectOpen}
        onOpenChange={setIsConnectOpen}
        projectBasePath="/cloud/project"
        returnUrl="/cloud?connectRepo=1"
      />
    </AppShell>
  )
}
