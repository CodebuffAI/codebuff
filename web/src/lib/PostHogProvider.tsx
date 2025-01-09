'use client'

import { useCallback, useEffect, createContext, useContext } from 'react'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { env } from '@/env.mjs'

type PostHogContextType = {
  reinitialize: () => void
}

const PostHogContext = createContext<PostHogContextType | null>(null)

export function usePostHog() {
  const context = useContext(PostHogContext)
  if (!context) {
    throw new Error('usePostHog must be used within a PostHogProvider')
  }
  return context
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initializePostHog = useCallback(() => {
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
  }, [])

  useEffect(() => {
    initializePostHog()
  }, [initializePostHog])

  return (
    <PostHogContext.Provider value={{ reinitialize: initializePostHog }}>
      <PHProvider client={posthog}>{children}</PHProvider>
    </PostHogContext.Provider>
  )
}
