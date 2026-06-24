import './globals.css'

import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
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

// Prefix-matched public areas (the path and everything beneath it).
const PUBLIC_WEB_PREFIXES = [
  '/web/about',
  '/web/community',
  '/web/contact',
  '/web/privacy',
  '/web/terms',
]

// Exact-match public pages. `/web` itself is the Freebuff Web landing page
// (logged-out marketing + logged-in dashboard), so it must be reachable without
// auth — but its sub-routes (project, settings, referrals, …) still require it.
const PUBLIC_WEB_EXACT = ['/web']

function isPublicWebPath(pathname: string | null) {
  if (!pathname) {
    return true
  }

  if (PUBLIC_WEB_EXACT.includes(pathname)) {
    return true
  }

  return PUBLIC_WEB_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

export default async function WebLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headerStore = await headers()
  const pathname = headerStore.get('x-pathname')
  const search = headerStore.get('x-search') ?? ''
  const requiresAuth = !isPublicWebPath(pathname)
  const session = requiresAuth ? await getServerSession(authOptions) : null

  if (requiresAuth && !session?.user?.id) {
    const callbackUrl = `${pathname ?? '/web'}${search}`
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  return (
    <div className="freebuff-web-shell dark min-h-screen overflow-y-scroll bg-[#0a0a0b] font-sans antialiased text-zinc-100">
      <ConvexClientProvider>
        <ReactQueryProvider>
          <TooltipProvider>
            <PosthogIdentificationProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                forcedTheme="dark"
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
