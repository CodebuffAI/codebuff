'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'

import CardWithBeams from '@/components/card-with-beams'

export function WelcomeCard({
  fallbackTitle,
  description,
  message,
}: {
  fallbackTitle: string
  description: string
  message: string
}) {
  const [referrer, setReferrer] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('codebuff_referrer')
    if (stored) {
      setReferrer(stored)
      posthog.capture(AnalyticsEvent.CODEBUFF_REFERRER_ATTRIBUTED, {
        referrer: stored,
        $set_once: { codebuff_referrer: stored },
      })
      localStorage.removeItem('codebuff_referrer')
    }
  }, [])

  const title = referrer
    ? `${referrer} invited you to Codebuff!`
    : fallbackTitle

  return (
    <CardWithBeams
      title={title}
      description={description}
      content={
        <div className="flex flex-col space-y-4 text-center">
          <p className="text-lg">{message}</p>
        </div>
      }
    />
  )
}
