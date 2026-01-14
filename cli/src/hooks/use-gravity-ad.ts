import { Message, WEBSITE_URL } from '@codebuff/sdk'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { subscribeToActivity } from '../utils/activity-tracker'
import { getAuthToken } from '../utils/auth'
import { logger, loggerContext } from '../utils/logger'

const AD_ROTATION_INTERVAL_MS = 60 * 1000 // 60 seconds per ad
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then stop

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

/**
 * Hook for fetching and rotating Gravity ads.
 *
 * Behavior:
 * - Ads only start after the user sends their first message
 * - Ads rotate every 60 seconds
 * - After 3 ads without user activity, rotation stops
 * - Any user activity resets the counter and resumes rotation
 *
 * Activity is tracked via the global activity-tracker module.
 */
export const useGravityAd = (): GravityAdState => {
  const [ad, setAd] = useState<AdResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const impressionFiredRef = useRef<Set<string>>(new Set())

  // Counter: how many ads shown since last user activity
  const adsShownRef = useRef<number>(0)

  // Is rotation currently paused (shown 3 ads without activity)?
  const isPausedRef = useRef<boolean>(false)

  // Rotation timer
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fire impression via web API when ad changes (grants credits)
  useEffect(() => {
    if (isActive && ad?.impUrl && !impressionFiredRef.current.has(ad.impUrl)) {
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
  }, [ad, isActive])

  const clearTimer = useCallback(() => {
    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current)
      rotationTimerRef.current = null
    }
  }, [])

  // Fetch an ad via web API
  const fetchAd = useCallback(async (): Promise<AdResponse | null> => {
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

    // Get the last assistant message and last user message
    const lastAssistantMessage = [...adMessages]
      .reverse()
      .find((message) => message.role === 'assistant')
    const lastUserMessage = [...adMessages]
      .reverse()
      .find((message) => message.role === 'user')

    const messagesToSend: { role: string; content: string }[] = []
    if (lastAssistantMessage) {
      messagesToSend.push({
        role: lastAssistantMessage.role,
        content: lastAssistantMessage.content,
      })
    }
    if (lastUserMessage) {
      messagesToSend.push({
        role: lastUserMessage.role,
        content: lastUserMessage.content.replace(
          /<user_message>(.*?)<\/user_message>/,
          '$1',
        ),
      })
    }

    try {
      const response = await fetch(`${WEBSITE_URL}/api/v1/ads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: messagesToSend,
          sessionId: loggerContext.clientSessionId,
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
      const ad = data.ad as AdResponse | null

      logger.info(
        { ad, request: { messages: messagesToSend } },
        '[gravity] Received ad response',
      )
      return ad
    } catch (err) {
      logger.error({ err }, '[gravity] Failed to fetch ad')
      return null
    }
  }, [])

  // Schedule ad rotation
  const scheduleRotation = useCallback(() => {
    clearTimer()

    if (!getAdsEnabled() || isPausedRef.current) {
      logger.debug(
        { isPaused: isPausedRef.current },
        '[gravity] Not scheduling rotation',
      )
      return
    }

    rotationTimerRef.current = setTimeout(async () => {
      adsShownRef.current += 1
      logger.info(
        { adsShown: adsShownRef.current, max: MAX_ADS_AFTER_ACTIVITY },
        '[gravity] Ad cycle complete',
      )

      if (adsShownRef.current >= MAX_ADS_AFTER_ACTIVITY) {
        logger.info('[gravity] Max ads shown, pausing rotation')
        isPausedRef.current = true
        return
      }

      const newAd = await fetchAd()
      if (newAd) {
        setAd(newAd)
      }

      scheduleRotation()
    }, AD_ROTATION_INTERVAL_MS)
  }, [clearTimer, fetchAd])

  // Handle activity from the global activity tracker
  const handleActivity = useCallback(() => {
    const wasPaused = isPausedRef.current
    adsShownRef.current = 0

    if (wasPaused) {
      logger.info('[gravity] User active, resuming ad rotation')
      isPausedRef.current = false
      scheduleRotation()
    }
  }, [scheduleRotation])

  // Subscribe to global activity tracker
  useEffect(() => {
    if (!getAdsEnabled()) return

    const unsubscribe = subscribeToActivity(handleActivity)
    return unsubscribe
  }, [handleActivity])

  // Subscribe to UI messages to detect first user message
  // We use UI messages (not runState.messageHistory) because UI messages
  // update immediately when the user sends a message, allowing us to fetch
  // ads sooner rather than waiting for the assistant to respond
  useEffect(() => {
    if (isActive || !getAdsEnabled()) {
      return
    }

    // Check initial state
    const initialMessages = useChatStore.getState().messages
    if (initialMessages.some((msg) => msg.variant === 'user')) {
      setIsActive(true)
      return
    }

    const unsubscribe = useChatStore.subscribe((state) => {
      const hasUserMessage = state.messages.some(
        (msg) => msg.variant === 'user',
      )

      if (hasUserMessage) {
        unsubscribe()
        logger.info('[gravity] First user message detected, starting ads')
        setIsActive(true)
      }
    })

    return unsubscribe
  }, [isActive])

  // Fetch first ad and start rotation when becoming active
  useEffect(() => {
    if (!isActive) return

    setIsLoading(true)
    fetchAd().then((firstAd) => {
      if (firstAd) {
        setAd(firstAd)
      }
      // Always start rotation, even if first fetch returned null
      scheduleRotation()
      setIsLoading(false)
    })
  }, [isActive, fetchAd, scheduleRotation])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return { ad: isActive ? ad : null, isLoading }
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
