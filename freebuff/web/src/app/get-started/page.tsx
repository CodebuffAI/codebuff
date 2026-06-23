// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing components are imported relatively instead.
import { CliLanding } from '../../components/landing/cli/CliLanding'
import { GetStartedReferrerCapture } from './get-started-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'
import { homeFaqs } from '@/lib/home-faqs'

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

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical: `${siteConfig.url()}/get-started`,
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
  const faqs = homeFaqs.map((f) => ({ q: f.question, a: f.answer }))

  // Renders the exact same page as /cli (LandingNavbar with login + Web/Chat/CLI
  // access, hero, install, FAQs, footer). The referral capture stays so invite
  // links continue to attribute the inviter.
  return (
    <>
      <GetStartedReferrerCapture referrerName={referrerName} />
      <CliLanding faqs={faqs} referrerName={referrerName} />
    </>
  )
}
