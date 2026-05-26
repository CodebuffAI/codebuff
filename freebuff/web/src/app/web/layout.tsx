import './globals.css'

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { ThemeProvider } from 'next-themes'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { ReactQueryProvider } from '@/app/web/providers'
import ConvexClientProvider from '@/vly/components/ConvexClientProvider'
import { PosthogIdentificationProvider } from '@/vly/components/posthog-identification-provider'
import { ConditionalAdminPanel } from '@/vly/components/providers/ConditionalAdminPanel'
import { ReactScanProvider } from '@/vly/components/ReactScanProvider'
import { Toaster } from '@/vly/components/ui/sonner'
import { TooltipProvider } from '@/vly/components/ui/tooltip'

export default async function WebLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/web')
  }

  return (
    <div className="min-h-screen overflow-y-scroll bg-[#CBCFDA] font-sans antialiased text-black">
      <ConvexClientProvider>
        <ReactQueryProvider>
          <TooltipProvider>
            <PosthogIdentificationProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
              >
                {process.env.NODE_ENV === 'development' && (
                  <ReactScanProvider />
                )}
                {children}
                <ConditionalAdminPanel />
                <Toaster position="top-right" richColors />
              </ThemeProvider>
            </PosthogIdentificationProvider>
          </TooltipProvider>
        </ReactQueryProvider>
      </ConvexClientProvider>
    </div>
  )
}
