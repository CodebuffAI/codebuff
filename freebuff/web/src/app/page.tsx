import HomeClient from './home-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = siteConfig.url()
  const title = 'Freebuff — the free coding agent (free Claude Code, Codex, Cursor & Lovable alternative)'
  const description = siteConfig.description

  return {
    title,
    description,
    keywords: siteConfig.keywords(),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'Freebuff',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

function SoftwareJsonLd({ siteUrl }: { siteUrl: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Freebuff',
          alternateName: ['Freebuff CLI', 'Freebuff Web'],
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'macOS, Windows, Linux',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '4.9',
            ratingCount: '512',
            bestRating: '5',
          },
          description:
            'Freebuff is a free CLI coding agent and a free full-stack app builder. The free alternative to Claude Code, Cursor, OpenAI Codex, Lovable, Replit Agent, Bolt.new, Windsurf, Emergent, and Devin.',
          url: siteUrl,
          softwareVersion: '1.0',
          downloadUrl: siteUrl,
        }),
      }}
    />
  )
}

export default function HomePage() {
  const siteUrl = siteConfig.url()
  return (
    <>
      <SoftwareJsonLd siteUrl={siteUrl} />
      <HomeClient />
    </>
  )
}
