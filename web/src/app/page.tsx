import { Metadata } from 'next'
import { env } from '@codebuff/common/env'

import { siteConfig } from '@/lib/constant'
import HomeClient from './home-client'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL

  const title = 'Codebuff – AI Coding Assistant for Your Terminal'
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

// WebSite JSON-LD schema with SearchAction for site search
function WebSiteJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Codebuff',
    url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    description: siteConfig.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/store?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// Organization JSON-LD schema with logo and social links
function OrganizationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Codebuff',
    url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    logo: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/opengraph-image.png`,
    description:
      'Codebuff is an AI-powered coding assistant that helps developers code faster by understanding entire codebases and executing commands via natural language.',
    foundingDate: '2024',
    sameAs: [
      'https://github.com/CodebuffAI/codebuff',
      'https://twitter.com/codebuffai',
      'https://www.linkedin.com/company/codebuff',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/docs/help`,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// SoftwareApplication JSON-LD schema for the product itself
function SoftwareApplicationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Codebuff',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    description:
      'AI-powered coding assistant that works in your terminal. Edit codebases and run commands via natural language.',
    url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    featureList: [
      'Natural language code editing across your entire codebase',
      'Terminal command execution via AI agent',
      'Deep project understanding and context-aware suggestions',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available with usage-based pricing',
      url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
    },
    author: {
      '@type': 'Organization',
      name: 'Codebuff',
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export default function HomePage() {
  return (
    <>
      <WebSiteJsonLd />
      <OrganizationJsonLd />
      <SoftwareApplicationJsonLd />
      <HomeClient />
    </>
  )
}
