import GetStartedClient from './get-started-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}): Promise<Metadata> {
  const resolvedSearchParams = await searchParams
  const referrerName = resolvedSearchParams.ref
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
  searchParams: Promise<{ ref?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const referrerName = resolvedSearchParams.ref?.slice(0, 50) ?? null

  return <GetStartedClient referrerName={referrerName} />
}
