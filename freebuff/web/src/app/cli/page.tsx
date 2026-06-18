// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing components are imported relatively instead.
import { CliLanding } from '../../components/landing/cli/CliLanding'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'
import { homeFaqs } from '@/lib/home-faqs'

const canonicalUrl = () => `${siteConfig.url()}/cli`

export async function generateMetadata(): Promise<Metadata> {
  const title =
    'Freebuff CLI — the free coding agent for your terminal (free Claude Code, Codex & Cursor alternative)'
  const description =
    'Freebuff CLI is a 100% free coding agent for your terminal. No subscriptions, no API keys. Install with npm and start coding in seconds. The free alternative to Claude Code, OpenAI Codex, and Cursor.'

  return {
    title,
    description,
    keywords: siteConfig.keywords(),
    alternates: { canonical: canonicalUrl() },
    openGraph: {
      title,
      description,
      url: canonicalUrl(),
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

function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function CliJsonLd() {
  const url = canonicalUrl()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Freebuff CLI',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'macOS, Windows, Linux',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Freebuff CLI is a free coding agent for your terminal. The free alternative to Claude Code, OpenAI Codex, Cursor, and Devin.',
            url,
            downloadUrl: 'https://www.npmjs.com/package/freebuff',
            installUrl: `${siteConfig.url()}/get-started`,
            featureList: [
              'Free CLI coding agent for the terminal',
              'No subscription or credit card required',
              '9 specialized subagents including code review and browser testing',
            ],
            sameAs: ['https://www.npmjs.com/package/freebuff'],
          }),
        }}
      />
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
    </>
  )
}

export default function CliPage() {
  const faqs = homeFaqs.map((f) => ({ q: f.question, a: f.answer }))
  return (
    <>
      <CliJsonLd />
      <CliLanding faqs={faqs} />
    </>
  )
}
