import '@/app/web/globals.css'

import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'

import { ReactQueryProvider } from '@/app/web/providers'
import ConvexClientProvider from '@/vly/components/ConvexClientProvider'
import { Toaster } from '@/vly/components/ui/sonner'
import { TooltipProvider } from '@/vly/components/ui/tooltip'
import { siteConfig } from '@/lib/constant'

const title = 'Freebuff Cloud — free cloud sandboxes for any GitHub repo'
const description =
  'Connect any GitHub repo and get a free cloud sandbox with a live preview. The free alternative to Lovable, Replit, Cursor Cloud, Devin, and Factory.'

export const metadata: Metadata = {
  title,
  description,
  keywords: siteConfig.keywords(),
  alternates: { canonical: '/cloud' },
  openGraph: {
    title,
    description,
    url: '/cloud',
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

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      data-cursor-skin="cursor"
      className="freebuff-web-shell dark min-h-screen overflow-y-scroll bg-[#1e1e1e] font-sans antialiased text-zinc-100"
    >
      <ConvexClientProvider>
        <ReactQueryProvider>
          <TooltipProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              forcedTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              {children}
              <Toaster position="top-right" richColors />
            </ThemeProvider>
          </TooltipProvider>
        </ReactQueryProvider>
      </ConvexClientProvider>
    </div>
  )
}
