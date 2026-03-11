import '@/styles/globals.css'

import type { Metadata } from 'next'

import { Footer } from '@/components/footer'
import { ThemeProvider } from '@/components/theme-provider'
import { siteConfig } from '@/lib/constant'
import { fonts } from '@/lib/fonts'
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
  openGraph: {
    url: siteConfig.url(),
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.title,
    type: 'website',
    locale: 'en',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
  },
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'flex flex-col min-h-screen font-sans bg-black text-white',
          fonts,
        )}
      >
        <ThemeProvider attribute="class">
          <SessionProvider>
            <div className="flex-grow">{children}</div>
            <Footer />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
