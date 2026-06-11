import HomeClient from './home-client'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'
import { homeFaqs } from '@/lib/home-faqs'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = siteConfig.url()
  const title =
    'Freebuff — the free coding agent (free Claude Code, Codex, Cursor & Lovable alternative)'
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

// Escape "<" so content can never terminate the script element (XSS hardening).
function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function SoftwareJsonLd({ siteUrl }: { siteUrl: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLd({
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
          installUrl: `${siteUrl}/get-started`,
          featureList: [
            'Free CLI coding agent for the terminal',
            'Free full-stack web app builder (Freebuff Web)',
            '9 specialized subagents including code review and browser testing',
            'No subscription or credit card required',
          ],
          sameAs: [
            'https://codebuff.com',
            'https://www.npmjs.com/package/freebuff',
          ],
        }),
      }}
    />
  )
}

function FaqJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLd({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: homeFaqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
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
      <FaqJsonLd />
      <HomeClient />
    </>
  )
}
