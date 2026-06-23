'use client'

import { env } from '@codebuff/common/env'
import { shouldMirrorAnalyticsEvent } from '@codebuff/common/util/log-mirror'
import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { PostHogProvider as PostHogProviderWrapper } from 'posthog-js/react'
import { useEffect, useRef, type ReactNode } from 'react'

import { shipBrowserLog } from './browser-log-shipper'
import {
  trackRedditLogin,
  trackRedditOncePerSession,
} from './reddit-funnel'

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
      // Mirror captured events into our Axiom logs sink, then pass them through
      // to PostHog unchanged. Returning the event (never null) keeps PostHog
      // behaviour identical — we only filter what gets COPIED to Axiom, dropping
      // high-volume auto-events (session replay, autocapture, heatmaps) that
      // would dominate ingest cost and bury queryable events. See log-mirror.ts.
      before_send: (event) => {
        if (event && shouldMirrorAnalyticsEvent(event.event)) {
          shipBrowserLog({
            timestamp: event.timestamp
              ? new Date(event.timestamp).toISOString()
              : undefined,
            level: 'info',
            event: event.event,
            message: event.event,
            client_session_id:
              typeof event.properties?.$session_id === 'string'
                ? event.properties.$session_id
                : undefined,
            data: event.properties,
          })
        }
        return event
      },
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
      if (!hadSession) {
        trackRedditOncePerSession('login', trackRedditLogin)
      }
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
