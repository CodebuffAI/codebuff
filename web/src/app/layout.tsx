import '@/styles/globals.css'

import { PropsWithChildren } from 'react'
import type { Metadata } from 'next'

import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar/navbar'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { PostHogProvider } from '@/lib/PostHogProvider'
import { CookieConsentCard } from '@/components/CookieConsentCard'
import { Banner } from '@/components/ui/banner'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import SessionProvider from '@/lib/SessionProvider'
import QueryProvider from '@/components/providers/query-client-provider'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { env } from '@/env.mjs'

export const generateMetadata = (): Metadata => ({
  metadataBase: new URL(siteConfig.url()),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords(),
  robots: { index: true, follow: true },
  icons: {
    icon: '/favicon/favicon.ico',
    shortcut: '/favicon/favicon-16x16.ico',
    apple: '/favicon/apple-touch-icon.png',
  },
  verification: {
    google: siteConfig.googleSiteVerificationId(),
  },
  openGraph: {
    url: siteConfig.url(),
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.title,
    images: '/opengraph-image.png',
    type: 'website',
    locale: 'en',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    images: '/opengraph-image.png',
  },
})

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <html lang={'en'} suppressHydrationWarning>
      <body
        className={cn(
          'flex flex-col min-h-screen font-sans bg-white text-black dark:bg-[#c96442] dark:text-white',
          fonts
        )}
      >
        <ThemeProvider attribute="class">
          <SessionProvider>
            <QueryProvider>
              <PostHogProvider>
                <Banner />
                <Navbar />
                <div className="flex-grow">
                  <LayoutWrapper>{children}</LayoutWrapper>
                </div>
                <Footer />
                <Toaster />
                <CookieConsentCard />
              </PostHogProvider>
            </QueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

export default RootLayout
