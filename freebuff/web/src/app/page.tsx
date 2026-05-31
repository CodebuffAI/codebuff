import HomeClient from './home-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = siteConfig.url()
  const title = 'Freebuff — the free coding agent'
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
      images: [siteConfig.socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [siteConfig.socialImage],
    },
  }
}

export default function HomePage() {
  return <HomeClient />
}
