import '@/app/web/globals.css'

import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'

import { ReactQueryProvider } from '@/app/web/providers'
import ConvexClientProvider from '@/vly/components/ConvexClientProvider'
import { Toaster } from '@/vly/components/ui/sonner'
import { TooltipProvider } from '@/vly/components/ui/tooltip'

export const metadata: Metadata = {
  title: 'Freebuff Cloud Beta',
  description: 'Connect a GitHub repo and build in a Freebuff Cloud sandbox.',
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
              {children}
              <Toaster position="top-right" richColors />
            </ThemeProvider>
          </TooltipProvider>
        </ReactQueryProvider>
      </ConvexClientProvider>
    </div>
  )
}
