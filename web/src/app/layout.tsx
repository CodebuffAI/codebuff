import '@/styles/globals.css'

import { PropsWithChildren } from 'react'
import type { Metadata } from 'next'

import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar/navbar'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import SessionProvider from '@/lib/SessionProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
    shortcut: '/favicon/favicon-16x16.png',
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

const queryClient = new QueryClient()

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <html lang={'en'} suppressHydrationWarning>
      <body
        className={cn(
          'flex flex-col min-h-screen font-sans bg-white text-black dark:bg-black dark:text-white',
          fonts
        )}
      >
        <ThemeProvider attribute="class">
          <SessionProvider>
            <QueryClientProvider client={queryClient}>
              <Navbar />
              <div className="flex-grow">{children}</div>
              <Footer />
              <Toaster />
            </QueryClientProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

export default RootLayout
