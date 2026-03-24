'use client'

import { env } from '@codebuff/common/env'
import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { PostHogProvider as PostHogProviderWrapper } from 'posthog-js/react'
import { useEffect, useRef, type ReactNode } from 'react'

export function PostHogProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const prevSessionRef = useRef(session)

  useEffect(() => {
    if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || typeof window === 'undefined') {
      return
    }

    posthog.init(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      api_host: '/ingest',
      ui_host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
      person_profiles: 'always',
    })
  }, [])

  useEffect(() => {
    if (!env.NEXT_PUBLIC_POSTHOG_API_KEY) {
      return
    }

    const hadSession = !!prevSessionRef.current?.user?.email
    const hasSession = !!session?.user?.email
    prevSessionRef.current = session

    if (hasSession && session.user) {
      posthog.identify(session.user.email!, {
        email: session.user.email,
        user_id: session.user.id,
        name: session.user.name,
      })
    } else if (hadSession && !hasSession) {
      posthog.reset()
    }
  }, [session])

  return (
    <PostHogProviderWrapper client={posthog}>
      {children}
    </PostHogProviderWrapper>
  )
}
