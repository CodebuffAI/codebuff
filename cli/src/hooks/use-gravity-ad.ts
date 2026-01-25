import { Message, WEBSITE_URL } from '@codebuff/sdk'
import { useEffect, useRef, useState } from 'react'

import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { isUserActive, subscribeToActivity } from '../utils/activity-tracker'
import { getAuthToken } from '../utils/auth'
import { logger } from '../utils/logger'

const AD_ROTATION_INTERVAL_MS = 60 * 1000 // 60 seconds per ad
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then pause fetching new ads
const ACTIVITY_THRESHOLD_MS = 30_000 // 30 seconds idle threshold for fetching new ads
const MAX_AD_CACHE_SIZE = 50 // Maximum number of ads to keep in cache

// Ad response type (matches Gravity API response, credits added after impression)
export type AdResponse = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
  credits?: number // Set after impression is recorded (in cents)
}

export type GravityAdState = {
  ad: AdResponse | null
  isLoading: boolean
}

// Consolidated controller state for the ad rotation logic
type GravityController = {
  cache: AdResponse[]
  cacheIndex: number
  impressionsFired: Set<string>
  adsShownSinceActivity: number
  tickInFlight: boolean
  intervalId: ReturnType<typeof setInterval> | null
}

// Pure helper: add an ad to the cache (if not already present)
function addToCache(ctrl: GravityController, ad: AdResponse): void {
  if (ctrl.cache.some((x) => x.impUrl === ad.impUrl)) return
  if (ctrl.cache.length >= MAX_AD_CACHE_SIZE) ctrl.cache.shift()
  ctrl.cache.push(ad)
}

// Pure helper: get the next cached ad (cycles through the cache)
function nextFromCache(ctrl: GravityController): AdResponse | null {
  if (ctrl.cache.length === 0) return null
  const ad = ctrl.cache[ctrl.cacheIndex % ctrl.cache.length]!
  ctrl.cacheIndex = (ctrl.cacheIndex + 1) % ctrl.cache.length
  return ad
}

/**
 * Hook for fetching and rotating Gravity ads.
 *
 * Behavior:
 * - Ads only start after the user sends their first message
 * - Ads rotate every 60 seconds
 * - After 3 ads without user activity, stops fetching new ads but continues cycling cached ads
 * - Any user activity resets the counter and resumes fetching new ads
 *
 * Activity is tracked via the global activity-tracker module.
 */
export const useGravityAd = (): GravityAdState => {
  const [ad, setAd] = useState<AdResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Use Zustand selector instead of manual subscription - only rerenders when value changes
  const hasUserMessaged = useChatStore((s) =>
    s.messages.some((m) => m.variant === 'user'),
  )

  // Single consolidated controller ref
  const ctrlRef = useRef<GravityController>({
    cache: [],
    cacheIndex: 0,
    impressionsFired: new Set(),
    adsShownSinceActivity: 0,
    tickInFlight: false,
    intervalId: null,
  })

  // Ref for the tick function (avoids useCallback dependency issues)
  const tickRef = useRef<() => void>(() => { })

  // Fire impression and update credits (called when showing an ad)
  const recordImpressionOnce = (impUrl: string): void => {
    const ctrl = ctrlRef.current
    if (ctrl.impressionsFired.has(impUrl)) return
    ctrl.impressionsFired.add(impUrl)

    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[gravity] No auth token, skipping impression recording')
      return
    }

    // Include mode in request - FREE mode should not grant credits
    const agentMode = useChatStore.getState().agentMode

    fetch(`${WEBSITE_URL}/api/v1/ads/impression`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ impUrl, mode: agentMode }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.creditsGranted > 0) {
          logger.info(
            { creditsGranted: data.creditsGranted },
            '[gravity] Ad impression credits granted',
          )
          setAd((cur) =>
            cur?.impUrl === impUrl
              ? { ...cur, credits: data.creditsGranted }
              : cur,
          )
        }
      })
      .catch((err) => {
        logger.debug({ err }, '[gravity] Failed to record ad impression')
      })
  }

  // Show an ad and fire impression
  const showAd = (next: AdResponse): void => {
    setAd(next)
    recordImpressionOnce(next.impUrl)
  }

  // Fetch an ad via web API
  const fetchAd = async (): Promise<AdResponse | null> => {
    if (!getAdsEnabled()) return null

    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[gravity] No auth token available')
      return null
    }

    // Get message history from runState (populated after LLM responds)
    const currentRunState = useChatStore.getState().runState
    const messageHistory =
      currentRunState?.sessionState?.mainAgentState?.messageHistory ?? []
    const adMessages = convertToAdMessages(messageHistory)

    // Also check UI messages for the latest user message
    // (UI messages update immediately, runState.messageHistory updates after LLM responds)
    const uiMessages = useChatStore.getState().messages
    const lastUIMessage = [...uiMessages]
      .reverse()
      .find((msg) => msg.variant === 'user')

    // If the latest UI user message isn't in our converted history, append it
    // This ensures we always include the most recent user message even before LLM responds
    if (lastUIMessage?.content) {
      const lastAdUserMessage = [...adMessages]
        .reverse()
        .find((m) => m.role === 'user')
      if (
        !lastAdUserMessage ||
        !lastAdUserMessage.content.includes(lastUIMessage.content)
      ) {
        adMessages.push({
          role: 'user',
          content: `<user_message>${lastUIMessage.content}</user_message>`,
        })
      }
    }

    try {
      const response = await fetch(`${WEBSITE_URL}/api/v1/ads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: adMessages,
          sessionId: useChatStore.getState().chatSessionId,
          device: getDeviceInfo(),
        }),
      })

      if (!response.ok) {
        logger.warn(
          { status: response.status, response: await response.json() },
          '[gravity] Web API returned error',
        )
        return null
      }

      const data = await response.json()
      return data.ad as AdResponse | null
    } catch (err) {
      logger.error({ err }, '[gravity] Failed to fetch ad')
      return null
    }
  }

  // Update tick function (uses ref to avoid useCallback dependency issues)
  tickRef.current = () => {
    void (async () => {
      const ctrl = ctrlRef.current
      if (ctrl.tickInFlight) return
      ctrl.tickInFlight = true

      try {
        if (!getAdsEnabled()) return

        // Derive "can fetch new ads" from counter and activity (no separate paused ref needed)
        const canFetchNew =
          ctrl.adsShownSinceActivity < MAX_ADS_AFTER_ACTIVITY &&
          isUserActive(ACTIVITY_THRESHOLD_MS)

        let next: AdResponse | null = null

        if (canFetchNew) {
          next = await fetchAd()
          if (next) addToCache(ctrl, next)
        }

        // Fall back to cached ads if no new ad
        if (!next) {
          next = nextFromCache(ctrl)
        }

        if (next) {
          ctrl.adsShownSinceActivity += 1
          showAd(next)
        }
      } finally {
        ctrl.tickInFlight = false
      }
    })()
  }

  // Reset ads shown counter on user activity
  useEffect(() => {
    if (!getAdsEnabled()) return
    return subscribeToActivity(() => {
      ctrlRef.current.adsShownSinceActivity = 0
    })
  }, [])

  // Start rotation when user sends first message
  useEffect(() => {
    if (!hasUserMessaged || !getAdsEnabled()) return

    setIsLoading(true)

    // Fetch first ad immediately
    void (async () => {
      const firstAd = await fetchAd()
      if (firstAd) {
        addToCache(ctrlRef.current, firstAd)
        showAd(firstAd)
        ctrlRef.current.adsShownSinceActivity = 1
      }
      setIsLoading(false)
    })()

    // Start interval for rotation (consistent 60s intervals)
    const id = setInterval(() => tickRef.current(), AD_ROTATION_INTERVAL_MS)
    ctrlRef.current.intervalId = id

    return () => {
      clearInterval(id)
      ctrlRef.current.intervalId = null
    }
  }, [hasUserMessaged])

  return { ad: hasUserMessaged ? ad : null, isLoading }
}

type AdMessage = { role: 'user' | 'assistant'; content: string }

/**
 * Convert LLM message history to ad API format.
 * Includes only user and assistant messages.
 */
const convertToAdMessages = (messages: Message[]): AdMessage[] => {
  const adMessages: AdMessage[] = messages
    .filter(
      (message) => message.role === 'assistant' || message.role === 'user',
    )
    .filter(
      (message) =>
        !message.tags || !message.tags.includes('INSTRUCTIONS_PROMPT'),
    )
    .map((message) => ({
      role: message.role,
      content: message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text.trim())
        .filter((c) => c !== '')
        .join('\n\n')
        .trim(),
    }))
    .filter((message) => message.content !== '')

  return adMessages
}

/** Device info sent to the ads API for targeting */
type DeviceInfo = {
  os: 'macos' | 'windows' | 'linux'
  timezone: string
  locale: string
}

/** Get device info for ads API */
function getDeviceInfo(): DeviceInfo {
  // Map Node.js platform to Gravity API os values
  const platformToOs: Record<string, 'macos' | 'windows' | 'linux'> = {
    darwin: 'macos',
    win32: 'windows',
    linux: 'linux',
  }
  const os = platformToOs[process.platform] ?? 'linux'

  // Get IANA timezone (e.g., "America/New_York")
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Get locale (e.g., "en-US")
  const locale = Intl.DateTimeFormat().resolvedOptions().locale

  return { os, timezone, locale }
}
