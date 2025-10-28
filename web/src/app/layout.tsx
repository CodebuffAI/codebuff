import '@/lib/server-init'
import '@/styles/globals.css'

import type { Metadata } from 'next'
import type { PropsWithChildren } from 'react'

import { CookieConsentCard } from '@/components/CookieConsentCard'
import { Footer } from '@/components/footer'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { Navbar } from '@/components/navbar/navbar'
import QueryProvider from '@/components/providers/query-client-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Banner } from '@/components/ui/banner'
import { Toaster } from '@/components/ui/toaster'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
import { PostHogProvider } from '@/lib/PostHogProvider'
import SessionProvider from '@/lib/SessionProvider'
import { cn } from '@/lib/utils'

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
    icon: '/favicon/favicon-32x32.ico',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang={'en'} suppressHydrationWarning>
      <body
        className={cn(
          'flex flex-col min-h-screen font-sans bg-white text-black dark:bg-black dark:text-white',
          fonts,
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
