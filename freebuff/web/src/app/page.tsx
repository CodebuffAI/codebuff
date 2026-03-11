import { env } from '@codebuff/common/env'

import HomeClient from './home-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL
  const title = "Freebuff — the free coding agent"
  const description = siteConfig.description

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'Freebuff',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default function HomePage() {
  return <HomeClient />
}
