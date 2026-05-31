import { getFreebuffLiveStats } from '@/server/live-stats'

import LiveClient from './live-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${siteConfig.url()}/live`
  return {
    title: 'Live Freebuff Users',
    description: 'Live aggregate Freebuff usage by country and model.',
    alternates: {
      canonical,
    },
    openGraph: {
      title: 'Live Freebuff Users',
      description: 'Live aggregate Freebuff usage by country and model.',
      url: canonical,
      type: 'website',
      siteName: 'Freebuff',
      images: [siteConfig.socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Live Freebuff Users',
      description: 'Live aggregate Freebuff usage by country and model.',
      images: [siteConfig.socialImage],
    },
  }
}

export default async function LivePage() {
  const initialStats = await getFreebuffLiveStats()
  return <LiveClient initialStats={initialStats} />
}
