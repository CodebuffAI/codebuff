'use client'

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
    const stored = localStorage.getItem('codebuff_referrer_display')
    if (stored) {
      setReferrer(stored)
      localStorage.removeItem('codebuff_referrer_display')
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
