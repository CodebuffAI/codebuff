'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { SignInButton } from '@/vly/components/auth/AuthComponents'
import { cn } from '@/vly/lib/utils'

// NB: `@/components/*` is aliased to `src/vly/components/*`, so the real landing
// components/data are imported relatively.
import { BrandLogo } from '../../../components/landing/BrandLogo'
import { Faq } from '../../../components/landing/sections/Faq'
import {
  AXIS_TICKS,
  WEB_COMPETITORS,
  logWidthPct,
  type Competitor,
} from '../../../components/landing/lib/competitors'

const WEB_FAQS = [
  {
    q: 'What is Freebuff Web?',
    a: 'Freebuff Web is a free AI app builder. Describe what you want and it builds, previews, and deploys a full-stack app — no setup and no API keys.',
  },
  {
    q: 'How can it be free?',
    a: 'Freebuff is supported by unobtrusive text ads. There are no subscriptions, credit cards, or usage paywalls to build and ship your app.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No. Describe your app in plain language and refine it by chatting. You can export the underlying code at any time.',
  },
  {
    q: 'Can I deploy and host my app for free?',
    a: 'Yes. Freebuff Web gives you a live preview URL and one-click deploy at no cost.',
  },
  {
    q: 'Can I bring my own design or theme?',
    a: 'Yes. Pick from built-in styles like Minimalism, Modern, or Neobrutalism — or just describe the look you want.',
  },
  {
    q: 'Are you training on my data?',
    a: "No. We don't share your data with third parties that would train on it, unless you choose a model clearly labeled as 'Collects data for training'.",
  },
]

/**
 * Marketing content shown on `/web` for logged-out visitors so the page works
 * as a standalone Freebuff Web landing page (the composer above still triggers
 * the sign-in wall on submit). Logged-in users see the dashboard instead.
 */
export function WebLandingSections() {
  return (
    <>
      {/* Cost comparison */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            The math
          </p>
          <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
            Why pay $600+/yr to build an app?
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/55">
            Other AI app builders gate the good stuff behind steep monthly
            plans. Freebuff Web is $0.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/[0.08] bg-[#0b0c0e]/80 px-4 py-7 sm:px-8">
          <WebCostChart />
        </div>
      </Section>

      {/* FAQ — reuse the landing FAQ styling, web-specific items */}
      <div className="-mx-4 sm:-mx-6">
        <Faq items={WEB_FAQS} />
      </div>

      {/* Final sign-in CTA */}
      <Section className="pb-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="lp-hero-heading text-3xl font-normal leading-tight text-white sm:text-4xl">
            Start building for free
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/55">
            No subscription, no API keys. Sign in and ship your first app in
            minutes.
          </p>
          <div className="mt-7 flex justify-center">
            <SignInButton mode="modal">
              <button className="inline-flex h-12 items-center gap-2 rounded-full bg-forest px-7 text-sm font-medium text-white transition-colors hover:bg-forest/90">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </button>
            </SignInButton>
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

function WebCostChart() {
  return (
    <div className="relative">
      {/* Gridlines */}
      <div className="pointer-events-none absolute inset-y-0 right-0 left-[112px] sm:left-[180px]">
        {AXIS_TICKS.map((t) => (
          <span
            key={t.value}
            className="absolute top-0 h-full w-px bg-white/[0.05]"
            style={{ left: `${logWidthPct(t.value)}%` }}
          />
        ))}
      </div>

      <div className="relative space-y-3 sm:space-y-4">
        {WEB_COMPETITORS.map((c, i) => (
          <ChartRow key={c.name} c={c} index={i} />
        ))}
      </div>

      {/* Axis labels */}
      <div className="relative mt-4 border-t border-white/[0.07] pt-2.5">
        <div className="absolute inset-y-0 right-0 left-[112px] sm:left-[180px]">
          {AXIS_TICKS.map((t) => (
            <span
              key={t.value}
              className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-white/30"
              style={{ left: `${logWidthPct(t.value)}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartRow({ c, index }: { c: Competitor; index: number }) {
  const pct = logWidthPct(c.yearly)

  return (
    <div className="flex items-center">
      <div className="flex w-[112px] shrink-0 items-center gap-2 sm:w-[180px] sm:gap-3">
        {c.freebuff ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/logo-icon.png"
            alt="Freebuff"
            width={24}
            height={24}
            draggable={false}
            className="shrink-0 rounded-[5px]"
            style={{ width: 24, height: 24 }}
          />
        ) : (
          <BrandLogo
            name={c.name}
            mark={c.mark}
            slug={c.slug}
            domain={c.domain}
            logo={c.logo}
            size={24}
          />
        )}
        <span
          className={cn(
            'truncate text-[12.5px] sm:text-[15px]',
            c.freebuff ? 'font-normal text-white' : 'text-white/70',
          )}
        >
          {c.name}
        </span>
      </div>

      <div className="relative h-9 flex-1 sm:h-11">
        {c.freebuff ? (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            whileInView={{ opacity: 1, scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-full bg-forest-bright shadow-[0_0_14px_4px_rgba(84,169,103,0.7)] sm:h-[26px]"
          />
        ) : (
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${pct}%` }}
            viewport={{ once: true }}
            transition={{
              duration: 0.75,
              delay: 0.06 * index,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute left-0 top-1/2 h-[22px] -translate-y-1/2 rounded-l-[3px] rounded-r-[6px] sm:h-[26px]"
            style={{ background: 'linear-gradient(90deg, #f8717126, #ef4444)' }}
          />
        )}

        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-[12px] font-normal tabular-nums sm:pl-3 sm:text-[15px]"
          style={{ left: c.freebuff ? '3px' : `${pct}%` }}
        >
          {c.freebuff ? (
            <span className="font-normal text-forest-bright">$0 / yr</span>
          ) : (
            <span className="text-white/60">
              ${c.yearly.toLocaleString()}
              <span className="text-white/30"> / yr</span>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

export default WebLandingSections
