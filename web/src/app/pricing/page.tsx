import { Metadata } from 'next'
import { env } from '@codebuff/common/env'

import PricingClient from './pricing-client'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`

  const title = 'Pricing – Simple, Usage-Based Plans | Codebuff'
  const description =
    'Get 500 free credits monthly, then pay just 1¢ per credit. No subscriptions required. Team and Enterprise plans available for organizations.'

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

// Product JSON-LD schema with multiple pricing tiers
function ProductJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Codebuff',
    description:
      'AI-powered coding assistant that helps developers code faster by understanding entire codebases and executing commands via natural language.',
    url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    brand: {
      '@type': 'Organization',
      name: 'Codebuff',
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    },
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Free Monthly Credits',
        value: '500',
      },
      {
        '@type': 'PropertyValue',
        name: 'Credit Expiration',
        value: 'Never',
      },
    ],
    offers: [
      {
        '@type': 'Offer',
        name: 'Free Tier',
        price: '0',
        priceCurrency: 'USD',
        description: '500 free credits monthly for individual developers',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2026-12-31',
        url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        name: 'Pay As You Go',
        price: '0.01',
        priceCurrency: 'USD',
        description: '1¢ per credit after free tier, no subscription required',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2026-12-31',
        url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        name: 'Team Plan',
        price: '19',
        priceCurrency: 'USD',
        description:
          'Per user per month. Includes team dashboard, pooled credits, and usage analytics.',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2026-12-31',
        url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        name: 'Enterprise Plan',
        description:
          'Custom pricing for larger organizations. Includes dedicated support and custom integrations.',
        availability: 'https://schema.org/InStock',
        url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// BreadcrumbList JSON-LD for navigation
function BreadcrumbJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Pricing',
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// Force static generation - content only changes on redeploy
export const dynamic = 'force-static'

export default function PricingPage() {
  return (
    <>
      <ProductJsonLd />
      <BreadcrumbJsonLd />
      <PricingClient />
    </>
  )
}
