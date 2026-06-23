'use client'

import { useEffect } from 'react'

import {
  trackRedditInstallation,
  trackRedditLogin,
  trackRedditOncePerSession,
} from '@/lib/reddit-funnel'

/** Fires Reddit conversion events after a successful CLI auth / onboard flow. */
export function OnboardConversionTracker() {
  useEffect(() => {
    trackRedditOncePerSession('cli_install', trackRedditInstallation)
    // Share the 'login' key with PostHogProvider so a fresh session landing on
    // /onboard logs LOGIN once, not once here and once from the auth handler.
    trackRedditOncePerSession('login', trackRedditLogin)
  }, [])

  return null
}
