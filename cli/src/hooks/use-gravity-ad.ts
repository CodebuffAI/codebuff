import { WEBSITE_URL } from '@codebuff/sdk'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { useEffect, useRef, useState } from 'react'

import { useTerminalLayout } from './use-terminal-layout'
import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { isUserActive, subscribeToActivity } from '../utils/activity-tracker'
import { getAuthToken } from '../utils/auth'
import { IS_FREEBUFF } from '../utils/constants'
import { getCliEnv } from '../utils/env'
import { logger } from '../utils/logger'
import { AI_MESSAGE_ID_PREFIX } from '../utils/ai-message-id'
import { trackEvent } from '../utils/analytics'
import {
  createLazyResponseAdQueue,
  MAX_RESPONSE_AD_POOL_SIZE,
  requestLazyResponseAds,
} from '../utils/lazy-response-ads'

import type { Message } from '@codebuff/sdk'
import type { ChatMessage } from '../types/chat'

const AD_ROTATION_INTERVAL_MS = 60 * 1000 // 60 seconds per ad
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then pause fetching new ads
const ACTIVITY_THRESHOLD_MS = 30_000 // 30 seconds idle threshold for fetching new ads
const MAX_AD_CACHE_SIZE = 50 // Maximum number of ads to keep in cache
const ZEROCLICK_IMPRESSIONS_URL = 'https://zeroclick.dev/api/v2/impressions'

// Ad response type (normalized shape across providers; credits added after impression)
export type AdResponse = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
  provider?: AdProvider
  impressionIds?: string[]
  credits?: number // Set after impression is recorded (in cents)
}

/**
 * Which upstream ad network to query. The server maps each provider onto the
 * same normalized response shape, so the rest of the hook is provider-agnostic.
 */
export type AdProvider = 'gravity' | 'carbon' | 'zeroclick'
// Product surfaces the ads API maps to Gravity placements. 'waiting_room' is the
// legacy wire name for the freebuff landing screen; 'cli_chat' is the inline
// transcript ad in the coding-agent chat. Values must match the server's
// AD_SURFACES enum, so don't rename them.
export type AdSurface = 'waiting_room' | 'cli_chat'

export type GravityAdState = {
  ads: AdResponse[] | null
  /**
   * On-demand ad pools keyed by assistant message id. The renderer repeats a
   * full pool when the response has more eligible slots than distinct ads.
   */
  responseAds: Record<string, AdResponse[]>
  /** Lazily fill the response's bounded ad pool as slots become eligible. */
  requestResponseAds: (messageId: string, count: number) => void
  isLoading: boolean
  recordClick: (ad: AdResponse) => void
  recordImpression: (ad: AdResponse) => void
}

// Consolidated controller state for the ad rotation logic
type GravityController = {
  choiceCache: AdResponse[][] // Cache of ad sets (choice or single-ad units)
  choiceCacheIndex: number
  impressionsFired: Set<string>
  adsShownSinceActivity: number
  tickInFlight: boolean
  inlineQueue: ReturnType<typeof createLazyResponseAdQueue<AdResponse>>
  eligibleSlotCounts: Map<string, number>
}

// Pure helper: add an ad set to the cache
function addToChoiceCache(ctrl: GravityController, ads: AdResponse[]): void {
  // ZeroClick offer responses must not be stored for later display. Keep them
  // out of the rotation cache and only render them for the live request.
  if (ads.some((ad) => ad.provider === 'zeroclick')) return

  // Deduplicate by checking if any set has the same first impUrl
  const key = ads[0]?.impUrl
  if (key && ctrl.choiceCache.some((set) => set[0]?.impUrl === key)) return
  if (ctrl.choiceCache.length >= MAX_AD_CACHE_SIZE) ctrl.choiceCache.shift()
  ctrl.choiceCache.push(ads)
}

// Pure helper: get the next cached ad set
function nextFromChoiceCache(ctrl: GravityController): AdResponse[] | null {
  if (ctrl.choiceCache.length === 0) return null
  const set = ctrl.choiceCache[ctrl.choiceCacheIndex % ctrl.choiceCache.length]!
  ctrl.choiceCacheIndex = (ctrl.choiceCacheIndex + 1) % ctrl.choiceCache.length
  return set
}

/**
 * A streamed LLM answer (possibly still in flight). Other top-level
 * 'ai'-variant messages (bash echoes, system notices, mode dividers) are
 * excluded via the `ai-` id prefix.
 */
export function isAnswerMessage(m: ChatMessage): boolean {
  return (
    !m.parentId && m.variant === 'ai' && m.id.startsWith(AI_MESSAGE_ID_PREFIX)
  )
}

export function isInlineAdEligibleAnswer(m: ChatMessage): boolean {
  return isAnswerMessage(m) && m.metadata?.allowInlineAds === true
}

export function claimAdImpression(
  impressionsFired: Set<string>,
  impUrl: string,
): boolean {
  if (impressionsFired.has(impUrl)) return false
  impressionsFired.add(impUrl)
  return true
}

function trackInlineAdEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown>,
): void {
  try {
    trackEvent(event, properties)
  } catch (error) {
    // Telemetry must never interfere with fetching or rendering an ad.
    logger.debug({ error, event }, '[ads] Failed to track inline ad event')
  }
}

type GravityAdOptionsBase = {
  enabled?: boolean
  /** Skip the "wait for first user message" gate. Used by the freebuff
   *  landing screen, which has no conversation but still needs ads. */
  forceStart?: boolean
  /** Ad network to request first. The server owns fallback ordering. */
  provider?: AdProvider
  /** Product surface requesting the ad. The server maps this to placements. */
  surface?: AdSurface
  /** Explicit provider placement id for the rotating `ads[0]` slot. */
  slotPlacementId?: string
}

type GravityAdOptions = GravityAdOptionsBase &
  (
    | {
        /** Lazily fetch interspersed ads as the assistant response grows. */
        inline: true
        /** Reusable provider placement id for every lazy inline auction. */
        inlinePlacementId: string
      }
    | {
        inline?: false
        inlinePlacementId?: never
      }
  )

/**
 * Fetches the rotating ad slot and, with `inline`, one reusable placement each
 * time another interspersed response slot becomes eligible. Short answers make
 * no unnecessary inline requests; long answers repeat a pool of four ads.
 */
export const useGravityAd = (options?: GravityAdOptions): GravityAdState => {
  const enabled = options?.enabled ?? true
  const forceStart = options?.forceStart ?? false
  const provider: AdProvider = options?.provider ?? 'gravity'
  const surface = options?.surface
  const inline = options?.inline ?? false
  const inlinePlacementId = options?.inlinePlacementId
  const slotPlacementId = options?.slotPlacementId
  const [ads, setAds] = useState<AdResponse[] | null>(null)
  const [responseAds, setResponseAds] = useState<Record<string, AdResponse[]>>(
    {},
  )
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
  // forceStart lets callers (e.g. the landing screen) opt out of the
  // "wait for the first user message" gate.
  const shouldStart = forceStart || hasUserMessagedStore

  // Single consolidated controller ref
  const ctrlRef = useRef<GravityController>({
    choiceCache: [],
    choiceCacheIndex: 0,
    impressionsFired: new Set(),
    adsShownSinceActivity: 0,
    tickInFlight: false,
    inlineQueue: createLazyResponseAdQueue<AdResponse>(),
    eligibleSlotCounts: new Map(),
  })

  // Ref for the tick function (avoids useCallback dependency issues)
  const tickRef = useRef<() => void>(() => {})

  // Ref to track whether ads should be hidden for use in async code
  const shouldHideAdsRef = useRef(shouldHideAds)
  shouldHideAdsRef.current = shouldHideAds

  // Fire impression and update credits (called when showing an ad)
  const recordImpressionOnce = (ad: AdResponse): void => {
    // Don't record impressions when ads should be hidden
    if (shouldHideAdsRef.current) return

    const ctrl = ctrlRef.current
    const { impUrl } = ad
    if (!claimAdImpression(ctrl.impressionsFired, impUrl)) return

    const recordLocalImpression = async (): Promise<void> => {
      const authToken = getAuthToken()
      if (!authToken) {
        logger.warn('[ads] No auth token, skipping local impression recording')
        return
      }

      // Include mode in request - Freebuff should not grant credits (no balance concept).
      const agentMode = useChatStore.getState().agentMode

      const res = await fetch(`${WEBSITE_URL}/api/v1/ads/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'User-Agent': getCliAdRequestUserAgent(),
        },
        body: JSON.stringify({
          impUrl,
          mode: agentMode,
        }),
      })

      if (!res.ok) {
        logger.debug(
          { status: res.status },
          '[ads] Failed to record local ad impression',
        )
        return
      }

      const data = await res.json()
      if (data.creditsGranted > 0) {
        logger.info(
          { creditsGranted: data.creditsGranted },
          '[ads] Ad impression credits granted',
        )
        // Also update credits in visible ads
        setAds((cur) => {
          if (!cur) return cur
          return cur.map((a) =>
            a.impUrl === impUrl ? { ...a, credits: data.creditsGranted } : a,
          )
        })
      }
    }

    if (ad.provider === 'zeroclick' && ad.impressionIds?.length) {
      void (async () => {
        try {
          const res = await fetch(ZEROCLICK_IMPRESSIONS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ad.impressionIds }),
          })

          if (!res.ok) {
            logger.debug(
              { status: res.status },
              '[ads] Failed to record ZeroClick impression',
            )
            return
          }
        } catch (err) {
          logger.debug({ err }, '[ads] Failed to record ZeroClick impression')
          return
        }

        recordLocalImpression().catch((err) => {
          logger.debug({ err }, '[ads] Failed to record local ad impression')
        })
      })()
      return
    }

    recordLocalImpression().catch((err) => {
      logger.debug({ err }, '[ads] Failed to record ad impression')
    })
  }

  const recordClick = (ad: AdResponse): void => {
    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[ads] No auth token, skipping ad click recording')
      return
    }

    void fetch(`${WEBSITE_URL}/api/v1/ads/click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'User-Agent': getCliAdRequestUserAgent(),
      },
      body: JSON.stringify({
        impUrl: ad.impUrl,
        ...(surface ? { surface } : {}),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          logger.debug(
            { status: res.status },
            '[ads] Failed to record ad click',
          )
        }
      })
      .catch((err) => {
        logger.debug({ err }, '[ads] Failed to record ad click')
      })
  }

  type FetchAdResult = { ads: AdResponse[] } | null

  // Fetch an ad via web API
  const fetchAd = async (params?: {
    placementId?: string
  }): Promise<FetchAdResult> => {
    // Don't fetch ads when they should be hidden
    if (shouldHideAdsRef.current) return null
    if (!getAdsEnabled()) return null

    const authToken = getAuthToken()
    if (!authToken) {
      logger.warn('[ads] No auth token available')
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
          'User-Agent': getCliAdRequestUserAgent(),
        },
        body: JSON.stringify({
          provider,
          messages: adMessages,
          sessionId: useChatStore.getState().chatSessionId,
          device: getDeviceInfo(),
          ...(surface ? { surface } : {}),
          ...(params?.placementId ? { placementId: params.placementId } : {}),
          // Carbon requires a real browser-ish useragent for targeting/fraud
          // detection. Gravity ignores it. We source one centrally so every
          // provider that needs it sees the same value.
          userAgent: getAdUserAgent(),
        }),
      })

      if (!response.ok) {
        let responseBody: unknown
        try {
          const contentType = response.headers.get('content-type') ?? ''
          responseBody = contentType.includes('application/json')
            ? await response.json()
            : await response.text()
        } catch {
          responseBody = 'Unable to parse error response'
        }
        logger.warn(
          { provider, status: response.status, response: responseBody },
          '[ads] Web API returned error',
        )
        return null
      }

      const data = await response.json()

      if (Array.isArray(data.ads) && data.ads.length > 0) {
        return {
          ads: (data.ads as AdResponse[]).map((ad) => ({
            ...ad,
            provider: data.provider ?? provider,
          })),
        }
      }
    } catch (err) {
      logger.error({ err, provider }, '[ads] Failed to fetch ad')
    }

    return null
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

        const result = canFetchNew
          ? await fetchAd({ placementId: slotPlacementId })
          : null

        if (result) {
          addToChoiceCache(ctrl, result.ads)
          ctrl.adsShownSinceActivity += 1
          setAds(result.ads)
        } else {
          // Fall back to cached ads
          const cachedSet = nextFromChoiceCache(ctrl)
          if (cachedSet) {
            ctrl.adsShownSinceActivity += 1
            setAds(cachedSet)
          } else {
            setAds((cur) => (cur?.[0]?.provider === 'zeroclick' ? null : cur))
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
      const result = await fetchAd({ placementId: slotPlacementId })
      if (result) {
        const ctrl = ctrlRef.current
        addToChoiceCache(ctrl, result.ads)
        setAds(result.ads)
        ctrl.adsShownSinceActivity = 1
      }
      setIsLoading(false)
    })()

    // Start interval for rotation (consistent 60s intervals)
    const id = setInterval(() => tickRef.current(), AD_ROTATION_INTERVAL_MS)

    return () => {
      clearInterval(id)
    }
  }, [shouldStart, shouldHideAds, provider, surface])

  // Called by BlocksRenderer only when its streamed node count makes another
  // between-node slot eligible, until the four-ad pool is full. Requests use
  // the same placement id and are serialized per answer so higher-value early
  // results retain their order. The renderer cycles that exact pool for later
  // slots without additional auctions or impression events.
  const requestResponseAds = (messageId: string, count: number): void => {
    if (
      !inline ||
      !inlinePlacementId ||
      count <= 0 ||
      shouldHideAdsRef.current ||
      !getAdsEnabled()
    ) {
      return
    }

    const messages = useChatStore.getState().messages
    const answer = messages.find((m) => m.id === messageId)
    if (!answer || !isInlineAdEligibleAnswer(answer)) {
      return
    }

    const ctrl = ctrlRef.current
    const previousEligibleCount = ctrl.eligibleSlotCounts.get(messageId) ?? 0
    if (count > previousEligibleCount) {
      ctrl.eligibleSlotCounts.set(messageId, count)
      const telemetryProperties = {
        response_id: messageId,
        chat_session_id: useChatStore.getState().chatSessionId,
        eligible_slot_count: count,
        pool_size: MAX_RESPONSE_AD_POOL_SIZE,
        provider,
        surface,
        placement_id: inlinePlacementId,
        is_freebuff: IS_FREEBUFF,
      }
      trackInlineAdEvent(
        AnalyticsEvent.CLI_INLINE_AD_SLOT_ELIGIBLE,
        telemetryProperties,
      )

      if (
        count > MAX_RESPONSE_AD_POOL_SIZE &&
        previousEligibleCount <= MAX_RESPONSE_AD_POOL_SIZE
      ) {
        trackInlineAdEvent(
          AnalyticsEvent.CLI_INLINE_AD_POOL_REUSED,
          telemetryProperties,
        )
      }
    }

    void requestLazyResponseAds({
      queue: ctrl.inlineQueue,
      messageId,
      count,
      fetchOne: async () => {
        const result = await fetchAd({ placementId: inlinePlacementId })
        return result?.ads[0] ?? null
      },
      onAd: (ad) => {
        setResponseAds((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), ad],
        }))
      },
    })
  }

  // Don't return ads when ads should be hidden
  const visible = shouldStart && !shouldHideAds
  return {
    ads: visible ? ads : null,
    responseAds: visible ? responseAds : {},
    requestResponseAds,
    isLoading,
    recordClick,
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

/**
 * Useragent string passed to ad providers. Carbon (BuySellAds) requires a
 * plausible browser useragent for targeting and fraud screening. We send a
 * stable desktop Chrome-on-{os} UA per platform so targeting is consistent
 * across users on the same platform without sharing anything identifying.
 *
 * Chrome version needs bumping periodically — stale UAs look bot-ish to ad
 * networks. Last bumped: 2026-04-21. Revisit roughly every 6 months.
 */
const AD_CHROME_VERSION = '124.0.0.0'
function getAdUserAgent(): string {
  const osUA: Record<string, string> = {
    darwin: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
    win32: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
    linux: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
  }
  return osUA[process.platform] ?? osUA.linux
}

function getCliAdRequestUserAgent(): string {
  const product = IS_FREEBUFF ? 'Freebuff-CLI' : 'Codebuff-CLI'
  const version = getCliEnv().CODEBUFF_CLI_VERSION ?? 'dev'
  return `${product}/${version}`
}
