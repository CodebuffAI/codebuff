import { getFreebuffLatencyStats } from '@/server/latency-stats'

import LatencyClient from './latency-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${siteConfig.url()}/latency`
  return {
    title: 'Freebuff Latency',
    description: 'Time to first token latency for Freebuff models.',
    alternates: {
      canonical,
    },
    openGraph: {
      title: 'Freebuff Latency',
      description: 'Time to first token latency for Freebuff models.',
      url: canonical,
      type: 'website',
      siteName: 'Freebuff',
      images: [siteConfig.socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Freebuff Latency',
      description: 'Time to first token latency for Freebuff models.',
      images: [siteConfig.socialImage],
    },
  }
}

export default async function LatencyPage() {
  const initialStats = await getFreebuffLatencyStats()
  return <LatencyClient initialStats={initialStats} />
}
