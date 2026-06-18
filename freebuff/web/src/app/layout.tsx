import '@/styles/globals.css'

import type { Metadata, Viewport } from 'next'
import Script from 'next/script'

import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/blog/json-ld'
import { Footer } from '@/components/footer'
import { ReferralCodeCapture } from '@/components/referral-code-capture'
import { ReferrerTracker } from '@/components/referrer-tracker'
import { ThemeProvider } from '@/components/theme-provider'
import { blogConfig } from '@/lib/blog/config'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
import { PostHogProvider } from '@/lib/PostHogProvider'
import SessionProvider from '@/lib/SessionProvider'
import { cn } from '@/lib/utils'

/**
 * Lock the viewport so iOS/Android browsers can't double-tap or pinch-zoom
 * the app, and so focusing an input never triggers Safari's reflow zoom.
 * Inputs further enforce >=16px font-size to keep iOS from auto-zooming.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0b',
}

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
    images: [siteConfig.socialImage],
    type: 'website',
    locale: blogConfig.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    site: `@${blogConfig.twitterHandle}`,
    images: [siteConfig.socialImage],
  },
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteUrl = siteConfig.url()
  const gravityPixelId = process.env.NEXT_PUBLIC_GRAVITY_PIXEL_ID
  const gravityPixelIdJson = JSON.stringify(gravityPixelId)
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
        {gravityPixelId && (
          <Script
            id="gravity-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                !function(w,d,t,u,n,a,m){w['GravityPixelObject']=n;w[n]=w[n]||function(){
                (w[n].q=w[n].q||[]).push(arguments)},w[n].l=1*new Date();a=d.createElement(t),
                m=d.getElementsByTagName(t)[0];a.async=1;a.src=u;m.parentNode.insertBefore(a,m)
                }(window,document,'script','https://code.trygravity.ai/gr-pix.js','gravity');
                gravity('init', ${gravityPixelIdJson});
              `,
            }}
          />
        )}
        <OrganizationJsonLd siteUrl={siteUrl} />
        <WebSiteJsonLd siteUrl={siteUrl} />
        <ThemeProvider attribute="class">
          <SessionProvider>
            <PostHogProvider>
              <ReferrerTracker />
              <ReferralCodeCapture />
              <div className="flex-grow">{children}</div>
              <Footer />
            </PostHogProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
