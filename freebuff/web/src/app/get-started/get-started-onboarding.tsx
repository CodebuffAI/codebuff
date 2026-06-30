'use client'

import {
  ArrowUpRight,
  Check,
  Copy,
  Github,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL } from '@codebuff/common/constants/freebuff-referral-tiers'

import type { ReferralEligibilityData } from '../api/web/referral-eligibility/route'

import { SignInButton } from '@/components/sign-in/sign-in-button'
import { Button } from '@/components/ui/button'
import { startProviderLink } from '@/lib/link-provider'
import { cn } from '@/lib/utils'

const INSTALL_COMMAND = 'npm install -g freebuff'

/** The referrer's name, attached to every funnel event so the onboarding funnel
 *  can be segmented by who sent the invite. Reads the `?referrer=` URL param
 *  first, then falls back to the value GetStartedReferrerCapture persisted to
 *  localStorage — the param doesn't always survive the OAuth round-trip. */
function referrerProps(): { referrer: string | null } {
  if (typeof window === 'undefined') return { referrer: null }
  const fromUrl = new URLSearchParams(window.location.search).get('referrer')
  if (fromUrl) return { referrer: fromUrl }
  try {
    return { referrer: localStorage.getItem('freebuff_referrer') }
  } catch {
    return { referrer: null }
  }
}

/** Map the eligibility response to a single funnel-friendly status string. */
function eligibilityStatus(data: ReferralEligibilityData): string {
  if (!data.githubLinked) return 'no_github'
  if (data.qualifies) return 'qualifies'
  if (data.accountAgeKnown) return 'github_too_young'
  return 'age_unknown'
}

function captureSignInClicked(provider: 'github' | 'google'): void {
  posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_SIGN_IN_CLICKED, {
    provider,
    ...referrerProps(),
  })
}

/**
 * The single focal card on /get-started. Drives the visitor straight to the
 * one action we want (sign in with a 1-year-old GitHub account) and then tells
 * them, in plain terms, that doing so unlocks GLM 5.2 for BOTH them and the
 * friend who invited them — that mutual reward is the motivation to connect:
 *
 *   - signed out          → embedded GitHub (recommended) + Google sign-in
 *   - signed in, no GitHub → connect GitHub so you both unlock GLM 5.2
 *   - GitHub < 1 year old  → neither of you unlocks it yet, but Freebuff is free
 *   - GitHub ≥ 1 year old  → you both unlocked GLM 5.2; here's how to install
 */
export function GetStartedOnboarding() {
  const { status } = useSession()
  const [eligibility, setEligibility] = useState<ReferralEligibilityData | null>(
    null,
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    setEligibility(null)
    // Funnel step: the visitor is authenticated on the page (just returned from
    // OAuth, or already signed in).
    posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_SIGNED_IN, {
      ...referrerProps(),
    })
    fetch('/api/web/referral-eligibility')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: ReferralEligibilityData) => {
        if (cancelled) return
        setEligibility(data)
        // Funnel step: did the invite qualify? (qualifies / github_too_young /
        // no_github / age_unknown)
        posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_ELIGIBILITY_RESOLVED, {
          status: eligibilityStatus(data),
          github_linked: data.githubLinked,
          qualifies: data.qualifies,
          ...referrerProps(),
        })
      })
      .catch(() => {
        // On failure, fall back to a neutral signed-in view (install only).
        if (cancelled) return
        const fallback: ReferralEligibilityData = {
          signedIn: true,
          githubLinked: true,
          qualifies: false,
          accountAgeKnown: false,
          minMonths: 12,
        }
        setEligibility(fallback)
        posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_ELIGIBILITY_RESOLVED, {
          status: 'error',
          github_linked: null,
          qualifies: false,
          ...referrerProps(),
        })
      })
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-7">
      {status === 'loading' ? (
        <CardSpinner label="Loading…" />
      ) : status !== 'authenticated' ? (
        <SignedOut />
      ) : !eligibility ? (
        <CardSpinner label="Checking your account…" />
      ) : (
        <SignedIn eligibility={eligibility} />
      )}
    </div>
  )
}

function SignedOut() {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-medium text-white">
          Sign in to claim your invite
        </h2>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <span className="absolute -top-2.5 right-3 z-10 rounded-full border border-acid-matrix/50 bg-black px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-acid-matrix">
            Recommended
          </span>
          <SignInButton
            providerDomain="github.com"
            providerName="github"
            onSelect={() => captureSignInClicked('github')}
          />
        </div>
        <p className="px-1 text-xs leading-relaxed text-white/45">
          If your GitHub account is at least{' '}
          {MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL} months old, you and your
          inviter both unlock GLM 5.2 once you start using Freebuff.
        </p>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-wider text-white/30">
            or
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <SignInButton
          providerDomain="google.com"
          providerName="google"
          onSelect={() => captureSignInClicked('google')}
        />
      </div>
    </div>
  )
}

function SignedIn({ eligibility }: { eligibility: ReferralEligibilityData }) {
  if (!eligibility.githubLinked) {
    return (
      <StatusCard
        tone="action"
        icon={<Github className="h-5 w-5" />}
        title="Connect GitHub to unlock GLM 5.2"
        body={`You're signed in with Google. Connect a GitHub account that's at least ${MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL} months old, then start using Freebuff — that's when you and your inviter both unlock it.`}
        action={
          <Button
            onClick={() => {
              posthog.capture(
                AnalyticsEvent.FREEBUFF_GET_STARTED_CONNECT_GITHUB_CLICKED,
                { ...referrerProps() },
              )
              startProviderLink('github', returnPathWithReferrer())
            }}
            className="h-11 w-full bg-acid-matrix/90 font-medium text-black transition-all duration-300 hover:bg-acid-matrix hover:shadow-[0_0_20px_rgba(124,255,63,0.3)]"
          >
            <Github className="mr-2 h-4 w-4" />
            Connect GitHub
          </Button>
        }
      >
        <InstallBlock muted />
      </StatusCard>
    )
  }

  if (eligibility.qualifies) {
    return (
      <StatusCard
        tone="success"
        icon={<ShieldCheck className="h-5 w-5" />}
        title="You're eligible for GLM 5.2"
        body="Your GitHub account qualifies. Install Freebuff and send your first message — that unlocks GLM 5.2 for you and your inviter."
      >
        <InstallBlock />
      </StatusCard>
    )
  }

  if (eligibility.accountAgeKnown) {
    return (
      <StatusCard
        tone="warn"
        icon={<TriangleAlert className="h-5 w-5" />}
        title={`Your GitHub account is under ${eligibility.minMonths} months old`}
        body={`GLM 5.2 needs a GitHub account at least ${eligibility.minMonths} months old, so this invite won't unlock it yet — but Freebuff is still free. Install it and start coding.`}
      >
        <InstallBlock />
      </StatusCard>
    )
  }

  // Linked, but we couldn't read the account age — stay neutral.
  return (
    <StatusCard
      tone="neutral"
      icon={<Check className="h-5 w-5" />}
      title="You're signed in"
      body={`Install Freebuff and start coding for free. If your GitHub account is at least ${eligibility.minMonths} months old, you and your inviter both unlock GLM 5.2 once you start using it.`}
    >
      <InstallBlock />
    </StatusCard>
  )
}

const ACCENT_TONE = 'border-acid-matrix/30 bg-acid-matrix/10 text-acid-matrix'

const TONES = {
  success: ACCENT_TONE,
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  action: ACCENT_TONE,
  neutral: 'border-white/15 bg-white/5 text-white/70',
} as const

function StatusCard({
  tone,
  icon,
  title,
  body,
  action,
  children,
}: {
  tone: keyof typeof TONES
  icon: React.ReactNode
  title: string
  body?: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full border',
            TONES[tone],
          )}
        >
          {icon}
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-medium text-white">{title}</h2>
          {body && (
            <p className="text-sm leading-relaxed text-white/55">{body}</p>
          )}
        </div>
      </div>
      {action}
      {children}
    </div>
  )
}

function InstallBlock({ muted = false }: { muted?: boolean }) {
  return (
    <div className={cn('space-y-3', muted && 'opacity-60')}>
      <div className="space-y-2">
        <p className="text-center text-xs uppercase tracking-wider text-white/35">
          Install in your terminal
        </p>
        <CommandLine command={INSTALL_COMMAND} />
        <p className="text-center text-xs text-white/40">
          Then run <code className="text-white/70">freebuff</code> inside any
          project.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] uppercase tracking-wider text-white/30">
          or
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <Button
        asChild
        variant="outline"
        className="h-11 w-full border-zinc-700 bg-transparent text-white transition-all duration-300 hover:border-acid-matrix/40 hover:text-acid-matrix"
      >
        <Link
          href="/web"
          onClick={() =>
            posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_WEB_CLICKED, {
              ...referrerProps(),
            })
          }
        >
          Build in your browser with Freebuff Web
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(command)
    setCopied(true)
    posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_INSTALL_COMMAND_COPIED, {
      ...referrerProps(),
    })
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : `Copy: ${command}`}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-left font-mono text-sm transition-colors hover:border-white/20 hover:bg-white/[0.05]"
    >
      <span className="select-none text-acid-matrix">$</span>
      <code className="flex-1 text-white/90">{command}</code>
      <span
        aria-hidden
        className="text-white/40 transition-colors group-hover:text-white"
      >
        {copied ? (
          <Check className="h-4 w-4 text-acid-matrix" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </span>
    </button>
  )
}

function CardSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-white/50">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

/** Return to /get-started preserving the inviter param so the page stays
 *  personalized after the GitHub link round-trip. */
function returnPathWithReferrer(): string {
  if (typeof window === 'undefined') return '/get-started'
  const referrer = new URLSearchParams(window.location.search).get('referrer')
  return referrer
    ? `/get-started?referrer=${encodeURIComponent(referrer)}`
    : '/get-started'
}
