// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing components are imported relatively instead.
import Image from 'next/image'
import Link from 'next/link'
import { Sparkles, Terminal } from 'lucide-react'

import { Starfield } from '../../components/landing/Starfield'

import { GetStartedReferrerCapture } from './get-started-client'
import { GetStartedOnboarding } from './get-started-onboarding'

import type { Metadata } from 'next'

import { blogConfig } from '@/lib/blog/config'
import { siteConfig } from '@/lib/constant'

function normalizeReferrer(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().slice(0, 50)
  return trimmed || null
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ referrer?: string }>
}): Promise<Metadata> {
  const resolvedSearchParams = await searchParams
  const referrerName = normalizeReferrer(resolvedSearchParams.referrer)
  const title = referrerName
    ? `${referrerName} invited you to try Freebuff!`
    : 'Get Started with Freebuff'
  // These links get pasted into chats and social feeds, so personalize the
  // unfurled preview card too — not just the browser tab title.
  const description = referrerName
    ? `${referrerName} is inviting you to Freebuff — a free AI coding agent. Code for free, no subscription, no credit card.`
    : siteConfig.description
  const url = `${siteConfig.url()}/get-started`

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      url,
      title,
      description,
      siteName: 'Freebuff',
      images: [siteConfig.socialImage],
      type: 'website',
      locale: blogConfig.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: `@${blogConfig.twitterHandle}`,
      images: [siteConfig.socialImage],
    },
  }
}

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ referrer?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const referrerName = normalizeReferrer(resolvedSearchParams.referrer)

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-black font-paragraph font-light text-white">
      <GetStartedReferrerCapture referrerName={referrerName} />

      {/* Landing-style night sky, matching /login for a consistent feel. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#070b11_0%,#070d12_34%,#05080c_66%,#000000_100%)]" />
      <div className="lp-gpu pointer-events-none absolute inset-0 opacity-40">
        <Starfield />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-7 px-5 py-12">
        {/* Invite header */}
        <header className="flex flex-col items-center text-center">
          <Link href="/" className="mb-5 flex flex-col items-center">
            <div className="relative mb-3">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  boxShadow:
                    '0 0 40px 10px rgba(124, 255, 63, 0.06), 0 0 80px 20px rgba(124, 255, 63, 0.03)',
                }}
              />
              <Image
                src="/logo-icon.png"
                alt="Freebuff"
                width={44}
                height={44}
                className="relative"
              />
            </div>
            <span className="font-serif text-xl tracking-widest text-white">
              freebuff
            </span>
          </Link>

          <h1 className="text-balance text-2xl font-medium leading-tight text-white sm:text-3xl">
            {referrerName ? (
              <>
                <span className="text-acid-matrix">{referrerName}</span> invited
                you to Freebuff
              </>
            ) : (
              'You’ve been invited to Freebuff'
            )}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            Code for free with AI. No subscription, no credit card.
          </p>
        </header>

        {/* The claim card */}
        <GetStartedOnboarding />

        {/* Refer-a-friend benefits */}
        <BenefitsStrip />
      </main>
    </div>
  )
}

function BenefitsStrip() {
  return (
    <section className="w-full max-w-md">
      <p className="mb-3 text-center text-xs uppercase tracking-wider text-white/35">
        Then invite friends and unlock
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Benefit
          icon={<Terminal className="h-4 w-4" />}
          title="GLM 5.2 in the CLI"
          desc="The most powerful open-source model — earn weekly sessions for every friend who joins and starts using Freebuff."
        />
        <Benefit
          icon={<Sparkles className="h-4 w-4" />}
          title="More on Freebuff Web"
          desc="Higher daily message limits and watermark-free deploys."
        />
      </div>
    </section>
  )
}

function Benefit({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-1.5 flex items-center gap-2 text-acid-matrix">
        {icon}
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-white/45">{desc}</p>
    </div>
  )
}
