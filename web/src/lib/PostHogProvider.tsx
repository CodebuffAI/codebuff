'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { usePathname } from 'next/navigation'
import { env } from '@/env.mjs'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    // Check for user consent
    const consent = localStorage.getItem('cookieConsent')
    const hasConsented = consent === null || consent === 'true'

    if (hasConsented && typeof window !== 'undefined') {
      // Initialize PostHog
      posthog.init(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
        api_host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
        person_profiles: 'always',
      })

      // Handle page views
      posthog.capture('$pageview')
    }

    // Clean up function when the component unmounts
    return () => {
      // posthog.shutdown()
    }
  }, [pathname])

  return <PHProvider client={posthog}>{children}</PHProvider>
}
