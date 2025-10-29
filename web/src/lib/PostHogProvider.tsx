'use client'

import { env } from '@codebuff/common/env'
import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { PostHogProvider as PostHogProviderWrapper } from 'posthog-js/react'
import {
  useEffect,
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react'

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

export function PostHogProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()

  const initializePostHog = useCallback(() => {
    // Skip if no API key is set
    if (!env.NEXT_PUBLIC_POSTHOG_API_KEY) {
      return
    }

    // Check for user consent
    const consent = localStorage.getItem('cookieConsent')
    const hasConsented = consent === null || consent === 'true'

    if (hasConsented && typeof window !== 'undefined') {
      // Initialize PostHog
      posthog.init(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
        api_host: '/ingest',
        ui_host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
        person_profiles: 'always',
      })

      // Handle page views
      posthog.capture('$pageview')
    }
  }, [])

  useEffect(() => {
    initializePostHog()
  }, [initializePostHog])

  // Identify user when session changes
  useEffect(() => {
    if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !session?.user?.email) {
      return
    }

    // Use email as the primary identifier
    posthog.identify(session.user.email, {
      email: session.user.email, // Ensure email is used as distinct_id
      user_id: session.user.id, // Keep user ID as a property
      name: session.user.name,
    })

    // Set alias to ensure user_id is linked to the email
    posthog.alias(session.user.id, session.user.email)
  }, [session])

  return (
    <PostHogContext.Provider value={{ reinitialize: initializePostHog }}>
      <PostHogProviderWrapper client={posthog}>
        {children}
      </PostHogProviderWrapper>
    </PostHogContext.Provider>
  )
}
