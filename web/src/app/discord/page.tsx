'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function DiscordRedirect() {
  useEffect(() => {
    // Track the Discord redirect event
    posthog.capture('discord_redirect', {
      $current_url: window.location.href,
      referrer: document.referrer || 'unknown',
    })
  }, [])

  return null
}
