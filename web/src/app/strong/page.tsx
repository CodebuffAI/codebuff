import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'

import StrongClient from './strong-client'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/strong`
  const title = `Codebuff ${SUBSCRIPTION_DISPLAY_NAME} — The Strongest Coding Agent`
  const description =
    'Deep thinking, multi-agent orchestration, and the strongest coding agent. Plans from $100/mo.'

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'Codebuff',
      images: '/opengraph-image.png',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: '/opengraph-image.png',
    },
  }
}

export const dynamic = 'force-static'

export default function StrongPage() {
  return <StrongClient />
}
