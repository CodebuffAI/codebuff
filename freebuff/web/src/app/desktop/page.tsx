// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing components are imported relatively instead.
import { DesktopLanding } from '../../components/landing/desktop/DesktopLanding'

import type { Metadata } from 'next'

import { siteConfig } from '@/lib/constant'

const canonicalUrl = () => `${siteConfig.url()}/desktop`

export async function generateMetadata(): Promise<Metadata> {
  const title =
    'Freebuff Desktop — the free coding agent for macOS, Windows & Linux'
  const description =
    'Freebuff Desktop is a free coding agent for your computer. Run multiple agents in parallel, each in its own workspace. No subscriptions, no API keys. Download for macOS, Windows, or Linux.'

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

const DESKTOP_FAQS: { q: string; a: string }[] = [
  {
    q: 'Is Freebuff Desktop free?',
    a: 'Yes. Freebuff Desktop is free to use with the best open-source models — no subscription, no credit card, and no API keys required.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'macOS (Apple Silicon and Intel), Windows (64-bit), and Linux (AppImage). Download the installer for your platform from this page.',
  },
  {
    q: 'How is it different from the Freebuff CLI?',
    a: 'The CLI runs in your terminal. Freebuff Desktop is a native app that lets you run multiple coding agents in parallel — each thread works in its own git workspace — with a queue and reusable workflows.',
  },
  {
    q: 'The app says it can’t be opened / isn’t signed. What do I do?',
    a: 'The beta builds aren’t code-signed yet. On macOS, right-click the app and choose Open (or allow it in System Settings → Privacy & Security). On Windows, if SmartScreen appears, click More info → Run anyway.',
  },
  {
    q: 'Do I need an account?',
    a: 'You sign in with GitHub or Google the first time you open the app. That’s it — no payment details.',
  },
]

function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function DesktopJsonLd() {
  const url = canonicalUrl()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Freebuff Desktop',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'macOS, Windows, Linux',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Freebuff Desktop is a free coding agent for your computer. Run multiple agents in parallel, each in its own workspace. The free alternative to Claude Code, OpenAI Codex, Cursor, and Devin.',
            url,
            installUrl: url,
            featureList: [
              'Free desktop coding agent for macOS, Windows, and Linux',
              'No subscription, API key, or credit card required',
              'Run multiple coding agents in parallel, each in its own git workspace',
              'Queue prompts and reusable workflows',
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: DESKTOP_FAQS.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: { '@type': 'Answer', text: faq.a },
            })),
          }),
        }}
      />
    </>
  )
}

export default function DesktopPage() {
  return (
    <>
      <DesktopJsonLd />
      <DesktopLanding faqs={DESKTOP_FAQS} />
    </>
  )
}
