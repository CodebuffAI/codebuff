'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'

declare global {
  interface Window {
    rdt?: (...args: unknown[]) => void
  }
}

export { REDDIT_PIXEL_ID } from '@/lib/reddit-pixel-config'

const FIRST_PROMPT_STORAGE_KEY = 'freebuff_reddit_first_prompt'

function trackReddit(...args: unknown[]) {
  if (typeof window === 'undefined') return
  window.rdt?.(...args)
}

function captureFunnel(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return
  posthog.capture(event, properties)
}

export function trackRedditSignUp() {
  captureFunnel(AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_SIGN_UP)
  trackReddit('SignUp')
}

export function trackRedditLogin() {
  captureFunnel(AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_LOGIN)
  trackReddit('Custom', { customEventName: 'Login' })
}

export function trackRedditInstallation() {
  captureFunnel(AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_CLI_INSTALLED)
  trackReddit('Custom', { customEventName: 'Installation' })
}

export function trackRedditFirstPromptOnce() {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(FIRST_PROMPT_STORAGE_KEY)) return
    localStorage.setItem(FIRST_PROMPT_STORAGE_KEY, '1')
  } catch {
    // Ignore blocked storage; still attempt to track once this page load.
  }
  captureFunnel(AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_FIRST_PROMPT)
  trackReddit('Custom', { customEventName: 'FirstPrompt' })
}

export function trackRedditGravityAdClick(
  surface: 'chat' | 'web',
  properties?: Record<string, unknown>,
) {
  captureFunnel(AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_GRAVITY_AD_CLICK, {
    surface,
    ...properties,
  })
  trackReddit('Custom', { customEventName: 'GravityAdClick', surface })
}

export function trackRedditOncePerSession(
  sessionKey: string,
  track: () => void,
) {
  if (typeof window === 'undefined') return
  try {
    const storageKey = `freebuff_reddit_${sessionKey}`
    if (sessionStorage.getItem(storageKey)) return
    sessionStorage.setItem(storageKey, '1')
  } catch {
    // Ignore blocked storage.
  }
  track()
}
