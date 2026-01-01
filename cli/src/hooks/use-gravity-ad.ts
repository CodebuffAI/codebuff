import { WEBSITE_URL } from '@codebuff/sdk'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { getAuthToken } from '../utils/auth'
import { logger } from '../utils/logger'

const AD_DISPLAY_DURATION_MS = 60 * 1000 // 60 seconds per ad
const PREFETCH_BEFORE_MS = 5 * 1000 // Fetch next ad 5 seconds before swap
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then stop

// Ad response type (matches Gravity API response, credits added after impression)
export type AdResponse = {
  adText: string
  title: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
  credits?: number // Set after impression is recorded (in cents)
}

export type GravityAdState = {
  ad: AdResponse | null
  isLoading: boolean
  reportActivity: () => void
}

/**
 * Hook for fetching and rotating Gravity ads.
 *
 * Behavior:
 * - Ads rotate every 60 seconds
 * - Next ad is pre-fetched 5 seconds before display for instant swap
 * - After 3 ads without user activity, rotation stops
 * - Any user activity resets the counter and resumes rotation
 */
export const useGravityAd = (): GravityAdState => {
  const [ad, setAd] = useState<AdResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [shouldShowAd, setShouldShowAd] = useState(false)
  const impressionFiredRef = useRef<Set<string>>(new Set())

  // Pre-fetched next ad ready to display
  const nextAdRef = useRef<AdResponse | null>(null)

  // Counter: how many ads shown since last user activity
  const adsShownRef = useRef<number>(0)

  // Is rotation currently paused (shown 3 ads without activity)?
  const isPausedRef = useRef<boolean>(false)

  // Timers
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Has the first ad been fetched?
  const isStartedRef = useRef<boolean>(false)

  // Fire impression via web API when ad changes (grants credits)
  // Only fire impressions when ad is actually being shown
  useEffect(() => {
    if (shouldShowAd && ad?.impUrl && !impressionFiredRef.current.has(ad.impUrl)) {
      const currentImpUrl = ad.impUrl
      impressionFiredRef.current.add(currentImpUrl)
      logger.info(
        { impUrl: currentImpUrl },
        '[gravity] Recording ad impression',
      )

      const authToken = getAuthToken()
      if (!authToken) {
        logger.warn('[gravity] No auth token, skipping impression recording')
        return
      }

      // Call our web API to fire impression and grant credits
      // Only send impUrl - server looks up trusted ad data from database
      fetch(`${WEBSITE_URL}/api/v1/ads/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          impUrl: currentImpUrl,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.creditsGranted > 0) {
            logger.info(
              { creditsGranted: data.creditsGranted },
              '[gravity] Ad impression credits granted',
            )
            // Update ad with credits from impression response
            setAd((currentAd) =>
              currentAd?.impUrl === currentImpUrl
                ? { ...currentAd, credits: data.creditsGranted }
                : currentAd,
            )
          }
        })
        .catch((err) => {
          logger.debug({ err }, '[gravity] Failed to record ad impression')
        })
    }
  }, [ad, shouldShowAd])

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current)
      prefetchTimerRef.current = null
    }
    if (swapTimerRef.current) {
      clearTimeout(swapTimerRef.current)
      swapTimerRef.current = null
    }
  }, [])

  // Fetch an ad via web API and return it (for pre-fetching)
  const fetchAdAsync = useCallback(async (): Promise<AdResponse | null> => {
    if (!getAdsEnabled()) return null

    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[gravity] No auth token available')
      return null
    }

    const currentRunState = useChatStore.getState().runState
    const messageHistory =
      currentRunState?.sessionState?.mainAgentState?.messageHistory ?? []

    logger.info(
      { messageCount: messageHistory.length },
      '[gravity] Fetching ad from web API',
    )

    try {
      const response = await fetch(`${WEBSITE_URL}/api/v1/ads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ messages: messageHistory }),
      })

      if (!response.ok) {
        logger.warn(
          { status: response.status },
          '[gravity] Web API returned error',
        )
        return null
      }

      const data = await response.json()
      const ad = data.ad as AdResponse | null

      logger.info(
        {
          ad,
        },
        '[gravity] Received ad response',
      )
      return ad
    } catch (err) {
      logger.error({ err }, '[gravity] Failed to fetch ad')
      return null
    }
  }, [])

  // Schedule the next ad cycle
  const scheduleNextCycle = useCallback(() => {
    clearTimers()

    if (!getAdsEnabled() || isPausedRef.current) {
      logger.debug(
        { isPaused: isPausedRef.current },
        '[gravity] Not scheduling next cycle',
      )
      return
    }

    // Schedule pre-fetch (55 seconds from now)
    prefetchTimerRef.current = setTimeout(async () => {
      logger.debug('[gravity] Pre-fetching next ad')
      nextAdRef.current = await fetchAdAsync()
    }, AD_DISPLAY_DURATION_MS - PREFETCH_BEFORE_MS)

    // Schedule swap (60 seconds from now)
    swapTimerRef.current = setTimeout(() => {
      // Increment counter and check if we should pause
      adsShownRef.current += 1
      logger.info(
        { adsShown: adsShownRef.current, max: MAX_ADS_AFTER_ACTIVITY },
        '[gravity] Ad cycle complete',
      )

      if (adsShownRef.current >= MAX_ADS_AFTER_ACTIVITY) {
        logger.info('[gravity] Max ads shown, pausing rotation')
        isPausedRef.current = true
        // Keep showing the current ad, just stop rotating
        return
      }

      // Swap to pre-fetched ad (or keep current if fetch failed)
      if (nextAdRef.current) {
        setAd(nextAdRef.current)
        nextAdRef.current = null
      }

      // Schedule next cycle
      scheduleNextCycle()
    }, AD_DISPLAY_DURATION_MS)
  }, [clearTimers, fetchAdAsync])

  // Report user activity - resets counter and resumes rotation if paused
  const reportActivity = useCallback(() => {
    const wasPaused = isPausedRef.current

    // Reset counter
    adsShownRef.current = 0

    if (wasPaused) {
      logger.info('[gravity] User active, resuming ad rotation')
      isPausedRef.current = false
      // Restart the cycle from current ad
      scheduleNextCycle()
    }
  }, [scheduleNextCycle])

  // Prefetch ad on startup (before any messages are sent)
  useEffect(() => {
    const adsEnabled = getAdsEnabled()
    const hasAuth = !!getAuthToken()

    if (adsEnabled && hasAuth && !isStartedRef.current) {
      logger.info('[gravity] Prefetching ad on startup')
      isStartedRef.current = true
      setIsLoading(true)

      // Prefetch first ad immediately
      fetchAdAsync().then((firstAd) => {
        setAd(firstAd)
        setIsLoading(false)
        scheduleNextCycle()
      })
    }
  }, [fetchAdAsync, scheduleNextCycle])

  // Subscribe to UI messages to detect first user message
  // Only show ads after the user has sent at least one message (clean startup UX)
  // We use UI messages instead of runState.messageHistory because UI messages
  // update immediately when the user sends a message
  useEffect(() => {
    if (shouldShowAd || !getAdsEnabled()) {
      return
    }

    // Check initial state
    const initialMessages = useChatStore.getState().messages
    if (initialMessages.some((msg) => msg.variant === 'user')) {
      setShouldShowAd(true)
      return
    }

    const unsubscribe = useChatStore.subscribe((state) => {
      const hasUserMessage = state.messages.some((msg) => msg.variant === 'user')

      if (hasUserMessage) {
        unsubscribe()
        logger.info('[gravity] First user message detected, showing ads')
        setShouldShowAd(true)
      }
    })

    return unsubscribe
  }, [shouldShowAd])

  // Clear timers only on unmount
  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  // Only return the ad if we should show it (after first user message)
  return { ad: shouldShowAd ? ad : null, isLoading, reportActivity }
}
