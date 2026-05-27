import '@/styles/globals.css'

import type { Metadata } from 'next'

import {
  OrganizationJsonLd,
  WebSiteJsonLd,
} from '@/components/blog/json-ld'
import { Footer } from '@/components/footer'
import { ReferrerTracker } from '@/components/referrer-tracker'
import { ThemeProvider } from '@/components/theme-provider'
import { blogConfig } from '@/lib/blog/config'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
import { PostHogProvider } from '@/lib/PostHogProvider'
import SessionProvider from '@/lib/SessionProvider'
import { cn } from '@/lib/utils'

export const generateMetadata = (): Metadata => ({
  metadataBase: new URL(siteConfig.url()),
  title: {
    default: siteConfig.title,
    template: `%s | Freebuff`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords(),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon/favicon-32x32.ico',
    shortcut: '/favicon/favicon-16x16.ico',
    apple: '/favicon/apple-touch-icon.png',
  },
  alternates: {
    canonical: siteConfig.url(),
    types: {
      'application/rss+xml': [
        {
          url: `${siteConfig.url()}${blogConfig.basePath}/rss.xml`,
          title: `${blogConfig.brand} Blog`,
        },
      ],
    },
  },
  openGraph: {
    url: siteConfig.url(),
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: 'Freebuff',
    type: 'website',
    locale: blogConfig.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    site: `@${blogConfig.twitterHandle}`,
  },
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteUrl = siteConfig.url()
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
       * `suppressHydrationWarning` on <body> mutes the warnings that fire when
       * browser extensions (Grammarly, password managers, ad blockers) inject
       * attributes like `data-new-gr-c-s-check-loaded` or `data-gr-ext-...`
       * onto the body before React hydrates. The flag only suppresses
       * mismatches on this element\u2019s own attributes, not on its children.
       */}
      <body
        suppressHydrationWarning
        className={cn(
          'flex flex-col min-h-screen font-sans bg-black text-white',
          fonts,
        )}
      >
        <OrganizationJsonLd siteUrl={siteUrl} />
        <WebSiteJsonLd siteUrl={siteUrl} />
        <ThemeProvider attribute="class">
          <SessionProvider>
            <PostHogProvider>
              <ReferrerTracker />
              <div className="flex-grow">{children}</div>
              <Footer />
            </PostHogProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
