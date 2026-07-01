'use client'

import { ArrowRight } from 'lucide-react'

import { SignInButton } from '@/vly/components/auth/AuthComponents'
import { cn } from '@/vly/lib/utils'

// NB: `@/components/*` is aliased to `src/vly/components/*`, so the real landing
// components/data are imported relatively.
import { Faq } from '../../../components/landing/sections/Faq'
import { CostChart } from '../../../components/landing/sections/CostChart'
import { WEB_COMPETITORS } from '../../../components/landing/lib/competitors'

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
          <CostChart competitors={WEB_COMPETITORS} />
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

export default WebLandingSections
