import { WEBSITE_URL } from '@codebuff/sdk'
import { useEffect, useRef, useState } from 'react'

import { useTerminalLayout } from './use-terminal-layout'
import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { isUserActive, subscribeToActivity } from '../utils/activity-tracker'
import { getAuthToken } from '../utils/auth'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'

import type { Message} from '@codebuff/sdk';

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

export type AdVariant = 'banner' | 'choice'

export type AdData =
  | { variant: 'banner'; ad: AdResponse }
  | { variant: 'choice'; ads: AdResponse[] }

export type GravityAdState = {
  ad: AdResponse | null
  adData: AdData | null
  isLoading: boolean
  recordImpression: (impUrl: string) => void
}

// Consolidated controller state for the ad rotation logic
type GravityController = {
  cache: AdResponse[]
  cacheIndex: number
  choiceCache: AdResponse[][] // Cache of choice ad sets (each entry is 4 ads)
  choiceCacheIndex: number
  variant: AdVariant | null // Assigned variant from backend
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

// Pure helper: add a choice ad set to the choice cache
function addToChoiceCache(ctrl: GravityController, ads: AdResponse[]): void {
  // Deduplicate by checking if any set has the same first impUrl
  const key = ads[0]?.impUrl
  if (key && ctrl.choiceCache.some((set) => set[0]?.impUrl === key)) return
  if (ctrl.choiceCache.length >= MAX_AD_CACHE_SIZE) ctrl.choiceCache.shift()
  ctrl.choiceCache.push(ads)
}

// Pure helper: get the next cached choice ad set
function nextFromChoiceCache(ctrl: GravityController): AdResponse[] | null {
  if (ctrl.choiceCache.length === 0) return null
  const set = ctrl.choiceCache[ctrl.choiceCacheIndex % ctrl.choiceCache.length]!
  ctrl.choiceCacheIndex = (ctrl.choiceCacheIndex + 1) % ctrl.choiceCache.length
  return set
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
export const useGravityAd = (options?: {
  enabled?: boolean
  /** Skip the "wait for first user message" gate. Used by the freebuff
   *  waiting room, which has no conversation but still needs ads. */
  forceStart?: boolean
}): GravityAdState => {
  const enabled = options?.enabled ?? true
  const forceStart = options?.forceStart ?? false
  const [ad, setAd] = useState<AdResponse | null>(null)
  const [adData, setAdData] = useState<AdData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check if terminal height is too small to show ads
  const { terminalHeight } = useTerminalLayout()
  const isVeryCompactHeight = terminalHeight <= 17

  // Freebuff always shows ads even on compact screens (ads are mandatory there).
  const isFreeMode = IS_FREEBUFF

  // Skip ads on very compact screens unless we're in Freebuff (where ads are mandatory)
  // Also skip if explicitly disabled (e.g. user has a subscription)
  const shouldHideAds = !enabled || (isVeryCompactHeight && !isFreeMode)

  // Use Zustand selector instead of manual subscription - only rerenders when value changes
  const hasUserMessagedStore = useChatStore((s) =>
    s.messages.some((m) => m.variant === 'user'),
  )
  // forceStart lets callers (e.g. the waiting room) opt out of the
  // "wait for the first user message" gate.
  const shouldStart = forceStart || hasUserMessagedStore

  // Single consolidated controller ref
  const ctrlRef = useRef<GravityController>({
    cache: [],
    cacheIndex: 0,
    choiceCache: [],
    choiceCacheIndex: 0,
    variant: null,
    impressionsFired: new Set(),
    adsShownSinceActivity: 0,
    tickInFlight: false,
    intervalId: null,
  })

  // Ref for the tick function (avoids useCallback dependency issues)
  const tickRef = useRef<() => void>(() => { })

  // Ref to track whether ads should be hidden for use in async code
  const shouldHideAdsRef = useRef(shouldHideAds)
  shouldHideAdsRef.current = shouldHideAds

  // Fire impression and update credits (called when showing an ad)
  const recordImpressionOnce = (impUrl: string): void => {
    // Don't record impressions when ads should be hidden
    if (shouldHideAdsRef.current) return

    const ctrl = ctrlRef.current
    if (ctrl.impressionsFired.has(impUrl)) return
    ctrl.impressionsFired.add(impUrl)

    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[gravity] No auth token, skipping impression recording')
      return
    }

    // Include mode in request - Freebuff should not grant credits (no balance concept).
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
          // Also update credits in adData for choice ads
          setAdData((cur) => {
            if (!cur) return cur
            if (cur.variant === 'choice') {
              return {
                ...cur,
                ads: cur.ads.map((a) =>
                  a.impUrl === impUrl ? { ...a, credits: data.creditsGranted } : a,
                ),
              }
            }
            if (cur.variant === 'banner' && cur.ad.impUrl === impUrl) {
              return { ...cur, ad: { ...cur.ad, credits: data.creditsGranted } }
            }
            return cur
          })
        }
      })
      .catch((err) => {
        logger.debug({ err }, '[gravity] Failed to record ad impression')
      })
  }

  // Show a single banner ad and fire impression
  const showAd = (next: AdResponse): void => {
    setAd(next)
    setAdData({ variant: 'banner', ad: next })
    recordImpressionOnce(next.impUrl)
  }

  // Show a choice ad set (impressions are fired by the component for visible ads only)
  const showChoiceAds = (ads: AdResponse[]): void => {
    setAd(ads[0] ?? null) // Keep backwards compat for ad field
    setAdData({ variant: 'choice', ads })
  }

  type FetchAdResult =
    | { variant: 'banner'; ad: AdResponse }
    | { variant: 'choice'; ads: AdResponse[] }
    | null

  // Fetch an ad via web API
  const fetchAd = async (): Promise<FetchAdResult> => {
    // Don't fetch ads when they should be hidden
    if (shouldHideAdsRef.current) return null
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
      const variant = data.variant ?? 'banner'

      if (variant === 'choice' && Array.isArray(data.ads) && data.ads.length > 0) {
        return { variant: 'choice', ads: data.ads as AdResponse[] }
      }

      if (data.ad) {
        return { variant: 'banner', ad: data.ad as AdResponse }
      }

      return null
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

        const result = canFetchNew ? await fetchAd() : null

        if (result) {
          ctrl.variant = result.variant
          if (result.variant === 'choice') {
            addToChoiceCache(ctrl, result.ads)
            ctrl.adsShownSinceActivity += 1
            showChoiceAds(result.ads)
          } else {
            addToCache(ctrl, result.ad)
            ctrl.adsShownSinceActivity += 1
            showAd(result.ad)
          }
        } else {
          // Fall back to cached ads
          if (ctrl.variant === 'choice') {
            const cachedSet = nextFromChoiceCache(ctrl)
            if (cachedSet) {
              ctrl.adsShownSinceActivity += 1
              showChoiceAds(cachedSet)
            }
          } else {
            const next = nextFromCache(ctrl)
            if (next) {
              ctrl.adsShownSinceActivity += 1
              showAd(next)
            }
          }
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

  // Start rotation when user sends first message (or immediately if forced).
  useEffect(() => {
    if (!shouldStart || !getAdsEnabled() || shouldHideAds) return

    setIsLoading(true)

    // Fetch first ad immediately
    void (async () => {
      const result = await fetchAd()
      if (result) {
        const ctrl = ctrlRef.current
        ctrl.variant = result.variant
        if (result.variant === 'choice') {
          addToChoiceCache(ctrl, result.ads)
          showChoiceAds(result.ads)
        } else {
          addToCache(ctrl, result.ad)
          showAd(result.ad)
        }
        ctrl.adsShownSinceActivity = 1
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
  }, [shouldStart, shouldHideAds])

  // Don't return ad when ads should be hidden
  const visible = shouldStart && !shouldHideAds
  return {
    ad: visible ? ad : null,
    adData: visible ? adData : null,
    isLoading,
    recordImpression: recordImpressionOnce,
  }
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
