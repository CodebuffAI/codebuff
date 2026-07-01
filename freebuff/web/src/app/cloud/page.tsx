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
import { CloudBetaBadge } from '@/vly/components/cloud/CloudBetaBadge'
import { CloudFeedbackDialog } from '@/vly/components/cloud/CloudFeedbackDialog'
import {
  CloudLandingSections,
  CLOUD_FAQS,
} from '@/vly/components/pages/CloudLandingSections'
import { siteConfig } from '@/lib/constant'
import {
  Github,
  Loader2,
  Plus,
  GitBranch,
  ArrowUpRight,
  MessageCircle,
  AlertTriangle,
  Cloud,
  MonitorPlay,
} from 'lucide-react'

function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function CloudJsonLd() {
  const url = `${siteConfig.url()}/cloud`
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Freebuff Cloud',
            applicationCategory: 'DeveloperApplication',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Freebuff Cloud connects to any GitHub repo and boots a free cloud sandbox with a live preview. The free alternative to Lovable, Replit, Cursor Cloud, Devin, and Factory.',
            url,
            featureList: [
              'Connect any GitHub repository, public or private',
              'Free cloud sandbox with a live preview URL',
              'No subscription, seats, or usage-based billing',
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: CLOUD_FAQS.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: { '@type': 'Answer', text: faq.a },
            })),
          }),
        }}
      />
    </>
  )
}

export default function CloudHome() {
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const isAuthLoading = status === 'loading'
  const router = useRouter()

  const projects = useQuery(api.project.getUserProjects, isAuthed ? {} : 'skip')
  const connectedProjects = (projects ?? []).filter(
    (p) => (p as any).project_type === 'connected_repo',
  )
  const webAccessStatus = useQuery(
    api.webAccess.getWebAccessStatus,
    isAuthed ? {} : 'skip',
  )
  const isCloudRegionLimited = webAccessStatus?.accessTier === 'limited'

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
    <>
      <CloudJsonLd />
      <AppShell
        ambient={<AmbientBackdrop />}
        brandName="Freebuff Cloud"
        brandHref="/cloud"
        brandBadge={<CloudBetaBadge />}
        contentClassName="px-4 sm:px-6"
        actions={isAuthed ? <LimitedSandboxBadge /> : null}
      >
        <div className="relative z-10 mx-auto w-full max-w-4xl pb-0 pt-20 sm:pt-32">
          {/* Compact header — only for the signed-in app view. Logged-out
              visitors get the full marketing hero below instead. */}
          {(isAuthed || isAuthLoading) && (
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
                <CloudBetaBadge className="mt-1 self-start" />
              </div>
              <p className="mt-3 max-w-lg text-base text-white/55">
                Connect any GitHub repo, get a cloud sandbox with a live
                preview, and build with free models.
              </p>
              {isCloudRegionLimited && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200/90">
                  <AlertTriangle className="h-3 w-3" />
                  Limited region: 1 new project per day on a smaller VM, one
                  project active at a time.
                </p>
              )}
            </header>
          )}

          {/* Main content */}
          {isAuthLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : !isAuthed ? (
            <section className="pb-6 pt-[4vh] text-center sm:pt-[8vh]">
              <p className="mb-5 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
                Free forever
              </p>
              <h1 className="lp-hero-heading mx-auto max-w-3xl text-balance text-4xl font-normal leading-[1.1] text-white sm:text-5xl lg:text-6xl">
                A cloud sandbox for{' '}
                <span className="text-forest-bright">any repo</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/55 sm:text-[17px]">
                Connect any GitHub repo and Freebuff boots a cloud sandbox with
                a live preview. No subscription, no setup, no lock-in.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent('/cloud?connectRepo=1')}`}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-forest px-7 text-sm font-medium text-white transition-colors hover:bg-forest/90"
                >
                  <Github className="h-4 w-4" />
                  Continue with GitHub
                </Link>
              </div>
              <div className="mx-auto mt-9 flex max-w-lg flex-col items-center justify-center gap-3 text-[13px] text-white/45 sm:flex-row sm:gap-7">
                <span className="inline-flex items-center gap-1.5">
                  <Github className="h-4 w-4 text-forest-bright" />
                  Any GitHub repo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-forest-bright" />
                  Real cloud sandbox
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MonitorPlay className="h-4 w-4 text-forest-bright" />
                  Live preview
                </span>
              </div>
            </section>
          ) : projects === undefined ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : connectedProjects.length === 0 ? (
            <button
              type="button"
              onClick={() => setIsConnectOpen(true)}
              className="group flex w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-[#202020] p-12 text-center transition-colors hover:border-primary/40 hover:bg-muted sm:p-20"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted">
                <Github className="h-7 w-7 text-white/50 transition-colors group-hover:text-primary" />
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
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
                      router.push(
                        `/cloud/project/${project.semantic_identifier}`,
                      )
                    }
                    className="group flex flex-col items-start gap-2 rounded-md border border-border bg-[#202020] p-4 text-left transition-all hover:border-primary/30 hover:bg-muted"
                  >
                    <div className="flex w-full items-center gap-2">
                      <Github className="h-4 w-4 shrink-0 text-white/55" />
                      <span className="min-w-0 flex-1 truncate font-medium text-white">
                        {(project as any).repo_full_name ||
                          project.name ||
                          project.semantic_identifier}
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-white/30 transition-colors group-hover:text-primary" />
                    </div>
                    <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-white/50">
                      <GitBranch className="h-3 w-3" />
                      {(project as any).current_branch ?? 'main'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Logged-out: marketing landing page (Cloud vs Web, pricing, FAQ). */}
          {!isAuthed && !isAuthLoading && <CloudLandingSections />}

          {/* Feedback survey prompt */}
          <div className="mt-20 flex flex-col gap-3 rounded-md border border-border bg-[#202020] px-5 py-4 sm:mt-28 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
              <CloudFeedbackDialog triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" />
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
                    {
                      href: 'https://codebuff.com',
                      label: 'Codebuff',
                      external: true,
                    },
                    {
                      href: 'https://github.com/CodebuffAI/codebuff',
                      label: 'GitHub',
                      external: true,
                    },
                    {
                      href: 'https://discord.gg/yXG3w7wxfs',
                      label: 'Discord',
                      external: true,
                    },
                  ].map(({ href, label, external }) => (
                    <Link
                      key={label}
                      href={href}
                      {...(external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
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
    </>
  )
}
