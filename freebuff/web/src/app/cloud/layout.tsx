import '@/app/web/globals.css'

import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'

import { ReactQueryProvider } from '@/app/web/providers'
import ConvexClientProvider from '@/vly/components/ConvexClientProvider'
import { Toaster } from '@/vly/components/ui/sonner'
import { TooltipProvider } from '@/vly/components/ui/tooltip'

import { CloudPasswordGate } from './CloudPasswordGate'

// Isolated testing area — never index or follow, and keep it out of sitemaps.
export const metadata: Metadata = {
  title: 'Freebuff Cloud (internal)',
  robots: { index: false, follow: false, nocache: true },
}

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="freebuff-web-shell dark min-h-screen overflow-y-scroll bg-[#0a0a0b] font-sans antialiased text-zinc-100">
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
              <CloudPasswordGate>{children}</CloudPasswordGate>
              <Toaster position="top-right" richColors />
            </ThemeProvider>
          </TooltipProvider>
        </ReactQueryProvider>
      </ConvexClientProvider>
    </div>
  )
}
