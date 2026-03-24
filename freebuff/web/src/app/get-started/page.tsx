import GetStartedClient from './get-started-client'

import type { Metadata } from 'next'

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

  return {
    title,
    description: siteConfig.description,
  }
}

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ referrer?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const referrerName = normalizeReferrer(resolvedSearchParams.referrer)

  return <GetStartedClient referrerName={referrerName} />
}
