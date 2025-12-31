import { Client } from '@gravity-ai/api'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { getCliEnv } from '../utils/env'
import { logger } from '../utils/logger'

import type { AdResponse } from '@gravity-ai/api'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const MAX_MESSAGES_FOR_AD = 100
const AD_DISPLAY_DURATION_MS = 60 * 1000 // 60 seconds per ad
const PREFETCH_BEFORE_MS = 5 * 1000 // Fetch next ad 5 seconds before swap
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then stop

type AdMessage = { role: 'user' | 'assistant'; content: string }

/**
 * Extract text content from a Message's content array
 */
const extractTextFromMessageContent = (content: Message['content']): string => {
  if (!Array.isArray(content)) return ''

  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('\n')
}

/**
 * Convert LLM message history to ad API format.
 * Includes all message types (user, assistant, tool, system) for analytics.
 */
const convertToAdMessages = (messages: Message[]): AdMessage[] => {
  const adMessages: AdMessage[] = []

  for (const message of messages.slice(-MAX_MESSAGES_FOR_AD)) {
    const textContent = extractTextFromMessageContent(message.content)
    if (textContent) {
      // Map all roles to user/assistant as required by the API
      const role = message.role === 'user' ? 'user' : 'assistant'
      adMessages.push({ role, content: textContent })
    }
  }

  return adMessages
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
  const clientRef = useRef<Client | null>(null)
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

  // Get runState from chat store
  const runState = useChatStore((state) => state.runState)

  // Initialize client on mount
  useEffect(() => {
    const apiKey = getCliEnv().GRAVITY_API_KEY
    logger.info(
      { hasApiKey: !!apiKey, adsEnabled: getAdsEnabled() },
      '[gravity] Initializing Gravity ad client',
    )
    if (apiKey) {
      clientRef.current = new Client(apiKey)
      logger.info('[gravity] Gravity client initialized successfully')
    } else {
      logger.warn('[gravity] No GRAVITY_API_KEY found in environment')
    }
  }, [])

  // Fire impression when ad changes
  useEffect(() => {
    if (ad?.impUrl && !impressionFiredRef.current.has(ad.impUrl)) {
      impressionFiredRef.current.add(ad.impUrl)
      logger.info({ impUrl: ad.impUrl }, '[gravity] Firing ad impression')
      fetch(ad.impUrl).catch((err) => {
        logger.debug({ err }, '[gravity] Failed to fire ad impression')
      })
    }
  }, [ad])

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

  // Fetch an ad and return it (for pre-fetching)
  const fetchAdAsync = useCallback(async (): Promise<AdResponse | null> => {
    const client = clientRef.current
    if (!client || !getAdsEnabled()) return null

    const currentRunState = useChatStore.getState().runState
    const messageHistory =
      currentRunState?.sessionState?.mainAgentState?.messageHistory ?? []
    const adMessages = convertToAdMessages(messageHistory)

    if (adMessages.length === 0) return null

    logger.info('[gravity] Fetching ad from Gravity API')
    
    try {
      const response = await client.getAd({ messages: adMessages })
      logger.info(
        {
          hasAd: !!response,
          adText: response?.adText,
          title: (response as { title?: string })?.title,
          clickUrl: response?.clickUrl,
          impUrl: response?.impUrl,
          payout: response?.payout,
        },
        '[gravity] Received ad response',
      )
      return response
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

  // Start ad rotation when enabled and we have messages
  useEffect(() => {
    const messageHistory =
      runState?.sessionState?.mainAgentState?.messageHistory ?? []
    const hasMessages = messageHistory.length > 0
    const adsEnabled = getAdsEnabled()
    const hasClient = !!clientRef.current

    if (hasMessages && adsEnabled && hasClient && !isStartedRef.current) {
      logger.info('[gravity] Starting ad rotation')
      isStartedRef.current = true
      setIsLoading(true)
      
      // Fetch and display first ad
      fetchAdAsync().then((firstAd) => {
        setAd(firstAd)
        setIsLoading(false)
        scheduleNextCycle()
      })
    }

    return () => clearTimers()
  }, [runState, fetchAdAsync, scheduleNextCycle, clearTimers])

  return { ad, isLoading, reportActivity }
}
