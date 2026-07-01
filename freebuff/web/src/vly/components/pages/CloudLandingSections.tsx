'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Cloud,
  FolderGit2,
  Github,
  Minus,
  MonitorPlay,
  Sparkles,
} from 'lucide-react'

// NB: `@/components/*` is aliased to `src/vly/components/*`, so the real landing
// components/data are imported relatively.
import { Faq } from '../../../components/landing/sections/Faq'
import { CostChart } from '../../../components/landing/sections/CostChart'
import { CLOUD_COMPETITORS } from '../../../components/landing/lib/competitors'

import { cn } from '@/vly/lib/utils'

export const CLOUD_FAQS = [
  {
    q: 'What is Freebuff Cloud?',
    a: 'Freebuff Cloud connects to any GitHub repository — including projects you started elsewhere — boots a cloud sandbox for it, and gives you a free coding agent plus a live preview URL. No local setup required.',
  },
  {
    q: 'How is Cloud different from Freebuff Web?',
    a: 'Freebuff Web scaffolds a brand-new app for you from a prompt. Freebuff Cloud works with any existing GitHub repo — your own codebase, a project exported from Lovable, Bolt, or Replit, or a team repo — and runs it in a full cloud sandbox with a live preview.',
  },
  {
    q: 'Can I connect a private repository?',
    a: 'Yes. Freebuff Cloud authenticates with GitHub and only requests access to the repos you choose to connect.',
  },
  {
    q: 'I already have a project on Lovable, Bolt, or Replit — can I move it here?',
    a: 'Yes. Those tools sync your project to a GitHub repo, so you can connect that same repo to Freebuff Cloud and keep building on it for free — no export step needed.',
  },
  {
    q: 'How can it be free?',
    a: 'Freebuff is supported by unobtrusive text ads. There are no subscriptions, seats, or usage-based bills for the cloud sandbox or the coding agent.',
  },
  {
    q: 'Are there any limits?',
    a: 'Most regions get full-size sandboxes with no daily cap. Some regions are temporarily limited to one active project and one new project per day on a smaller VM while we scale up capacity.',
  },
  {
    q: 'Are you training on my code?',
    a: "No. We don't share your repo or code with third parties that would train on it, unless you choose a model clearly labeled as 'Collects data for training'.",
  },
]

/**
 * Marketing content shown on `/cloud` for logged-out visitors so the page
 * works as a standalone Freebuff Cloud landing page. Logged-in users see
 * their connected repos instead.
 */
export function CloudLandingSections() {
  return (
    <>
      <ComparisonSection />

      {/* Cost comparison */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            The math
          </p>
          <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
            Why pay $600–$2,400/yr for a cloud coding agent?
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/55">
            Cloud sandboxes and background agents are usually locked behind the
            priciest tier of an already-expensive plan. Freebuff Cloud is $0.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-3xl">
          <CostChart competitors={CLOUD_COMPETITORS} />
        </div>
      </Section>

      <LovableSection />

      {/* FAQ */}
      <div className="-mx-4 mt-16 sm:-mx-6 sm:mt-24">
        <Faq items={CLOUD_FAQS} />
      </div>

      {/* Final sign-in CTA */}
      <Section className="pb-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
            Connect your first repo for free
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/55">
            No subscription, no per-seat pricing. Sign in with GitHub and get a
            live cloud sandbox in minutes.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              href={`/login?callbackUrl=${encodeURIComponent('/cloud?connectRepo=1')}`}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-forest px-7 text-sm font-medium text-white transition-colors hover:bg-forest/90"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}

function Section({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-16 sm:mt-24', className)}>{children}</section>
  )
}

/* ── Cloud vs Web — the core differentiation the user asked to make clear ── */
type Row = { label: string; web: React.ReactNode; cloud: React.ReactNode }

const ROWS: Row[] = [
  {
    label: 'Starting point',
    web: 'A new app, scaffolded from a prompt',
    cloud: 'Any existing GitHub repo',
  },
  {
    label: 'Projects supported',
    web: 'One Freebuff-managed project at a time',
    cloud: 'Connect as many repos as you want',
  },
  {
    label: 'Where it runs',
    web: 'Freebuff-hosted app builder',
    cloud: 'A full cloud sandbox for your repo',
  },
  {
    label: 'Live preview',
    web: true,
    cloud: true,
  },
  {
    label: 'Bring your own codebase',
    web: false,
    cloud: true,
  },
  {
    label: 'Best for',
    web: 'Going from idea to app fast',
    cloud: 'Existing codebases, teams, and side projects you already started',
  },
]

function Cell({ value }: { value: React.ReactNode }) {
  if (value === true) {
    return <Check className="h-4 w-4 text-forest-bright" />
  }
  if (value === false) {
    return <Minus className="h-4 w-4 text-white/25" />
  }
  return <span>{value}</span>
}

function ComparisonSection() {
  return (
    <Section className="mt-0">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
          Web vs Cloud
        </p>
        <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
          Not another app builder — a sandbox for what you already have
        </h2>
        <p className="mt-3 text-base leading-relaxed text-white/55">
          Freebuff Web starts a new app from scratch. Freebuff Cloud connects to
          any GitHub repo — new or years old — and gives it a cloud sandbox with
          a live preview.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-y-10 gap-x-8 sm:grid-cols-3">
        <Feature
          icon={<Github className="h-5 w-5" />}
          title="Connect any repo"
          desc="Not just one Freebuff project — any GitHub repository you own or maintain."
        />
        <Feature
          icon={<Cloud className="h-5 w-5" />}
          title="Runs in the cloud"
          desc="A real sandbox for your project, not a local install or a single scaffolded template."
        />
        <Feature
          icon={<MonitorPlay className="h-5 w-5" />}
          title="Live preview"
          desc="See your app running as the agent works — share the link with anyone."
        />
      </div>

      <div className="mx-auto mt-16 max-w-3xl">
        <div className="grid grid-cols-[1.1fr_1fr_1fr] border-b border-white/10 pb-3 text-xs uppercase tracking-wide text-white/40 sm:text-[13px]">
          <div />
          <div className="flex items-center gap-1.5 px-3">
            <Sparkles className="h-3.5 w-3.5" />
            Freebuff Web
          </div>
          <div className="flex items-center gap-1.5 px-3 text-forest-bright">
            <FolderGit2 className="h-3.5 w-3.5" />
            Freebuff Cloud
          </div>
        </div>
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1.1fr_1fr_1fr] items-center border-b border-white/[0.06] py-4 text-[13px] sm:text-sm"
          >
            <div className="pr-3 text-white/50">{row.label}</div>
            <div className="px-3 text-white/60">
              <Cell value={row.web} />
            </div>
            <div className="px-3 text-white/90">
              <Cell value={row.cloud} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-forest-bright">
        {icon}
      </span>
      <p className="mt-4 text-[15px] font-medium text-white/90">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/50">{desc}</p>
    </div>
  )
}

/* ── "Cancel your Lovable subscription" migration pitch ──────────────────── */
function LovableSection() {
  return (
    <Section>
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
          Already paying for a cloud agent?
        </p>
        <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
          Cancel your Lovable subscription.
          <br className="hidden sm:block" /> Keep the project.
        </h2>
        <p className="mt-3 text-base leading-relaxed text-white/55">
          Lovable, Bolt, and Replit all sync your app to a GitHub repo behind
          the scenes. Connect that same repo to Freebuff Cloud and keep building
          — for free.
        </p>
      </div>

      <ul className="mx-auto mt-9 flex max-w-xl flex-col gap-3.5 text-left text-[15px] text-white/75">
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-bright" />
          Connect your Lovable-synced repo in one click — no export, no rewrite.
        </li>
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-bright" />
          Stop paying $50+/mo for Lovable, or $1,000+/yr for Replit.
        </li>
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-bright" />
          Already on Cursor Cloud, Devin, or Factory? Point them at the same repo
          and stop burning paid cloud-agent credits on it.
        </li>
      </ul>

      <div className="mt-9 flex justify-center">
        <Link
          href={`/login?callbackUrl=${encodeURIComponent('/cloud?connectRepo=1')}`}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-forest px-6 text-sm font-medium text-white transition-colors hover:bg-forest/90"
        >
          <Github className="h-4 w-4" />
          Connect your repo, free
        </Link>
      </div>
    </Section>
  )
}

export default CloudLandingSections
