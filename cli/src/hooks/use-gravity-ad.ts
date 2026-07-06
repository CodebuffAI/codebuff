import { WEBSITE_URL } from '@codebuff/sdk'
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

import type { Message } from '@codebuff/sdk'
import type { ChatMessage } from '../types/chat'

const AD_ROTATION_INTERVAL_MS = 60 * 1000 // 60 seconds per ad
const MAX_ADS_AFTER_ACTIVITY = 3 // Show up to 3 ads after last activity, then pause fetching new ads
const ACTIVITY_THRESHOLD_MS = 30_000 // 30 seconds idle threshold for fetching new ads
const MAX_AD_CACHE_SIZE = 50 // Maximum number of ads to keep in cache
const ZEROCLICK_IMPRESSIONS_URL = 'https://zeroclick.dev/api/v2/impressions'

// Inline ad pacing — anchors go below *completed* assistant answers (an answer
// is "completed" once its turn finishes, so an anchor never sits under the
// actively-streaming last turn). Tweak these two knobs to experiment with
// frequency:
//   AD_FIRST_ANSWER_OFFSET — index of the first completed answer that gets an
//     ad; 0 = right after the very first answer (most prominent).
//   AD_STEP_EXCHANGES — completed answers between ads after that first one.
const AD_FIRST_ANSWER_OFFSET = 0
const AD_STEP_EXCHANGES = 2

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

/**
 * An ad pinned into the chat transcript. `afterMessageId` anchors it directly
 * below a specific (settled) top-level message; once placed it never moves, so
 * it stays put in scrollback and multiple can be on screen at once.
 */
export type PlacedAd = {
  ad: AdResponse
  afterMessageId: string
}

export type GravityAdState = {
  ads: AdResponse[] | null
  /** Ads interleaved into the transcript, in placement order. */
  placedAds: PlacedAd[]
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
 * A completed, streamed LLM answer — the only messages inline ads anchor to.
 * Other top-level 'ai'-variant messages (bash `!command` echoes, system notices,
 * mode dividers) are excluded via the `ai-` id prefix so they don't inflate the
 * spacing cadence or get an ad below them.
 */
export function isCompletedAnswer(m: ChatMessage): boolean {
  return (
    !m.parentId &&
    m.variant === 'ai' &&
    !!m.isComplete &&
    m.id.startsWith(AI_MESSAGE_ID_PREFIX)
  )
}

/** Frequency knobs for inline ad placement; defaults from the module constants. */
export type AdPacing = { firstOffset?: number; step?: number }

/**
 * Pure helper: given the ids of completed assistant answers in transcript order,
 * return the ones that should get an inline ad — the answer at `firstOffset`,
 * then every `step` answers after it.
 */
export function inlineAdAnchorIds(
  completedAnswerIds: string[],
  pacing: AdPacing = {},
): string[] {
  const firstOffset = pacing.firstOffset ?? AD_FIRST_ANSWER_OFFSET
  const step = Math.max(1, pacing.step ?? AD_STEP_EXCHANGES)
  const anchors: string[] = []
  for (let i = firstOffset; i <= completedAnswerIds.length - 1; i += step) {
    anchors.push(completedAnswerIds[i]!)
  }
  return anchors
}

/**
 * Draw the next ad whose `impUrl` hasn't been used yet, or null if the pool is
 * empty or every ad in it is already placed. `drawAd` cycles the pool, so seeing
 * an `impUrl` twice means we've been through the whole pool without a fresh one.
 */
function drawUnusedAd(
  drawAd: () => AdResponse | null,
  usedImpUrls: Set<string>,
): AdResponse | null {
  const tried = new Set<string>()
  for (;;) {
    const ad = drawAd()
    if (!ad) return null
    if (!usedImpUrls.has(ad.impUrl)) return ad
    if (tried.has(ad.impUrl)) return null
    tried.add(ad.impUrl)
  }
}

/**
 * Pure helper: compute the inline ads to append this pass. Fills every anchor
 * ({@link inlineAdAnchorIds}) not already in `placedAds`, drawing a *distinct*
 * ad per new anchor via `drawAd` — the same ad is never shown twice in the
 * transcript. Idempotent: anchors already placed are skipped, so re-running with
 * an unchanged transcript adds nothing. Stops when no unused ad is available
 * (empty cache, or every cached ad is already placed), leaving later anchors for
 * a future pass once fresh ads are fetched.
 */
export function computeInlineAdAdditions(params: {
  completedAnswerIds: string[]
  placedAds: PlacedAd[]
  drawAd: () => AdResponse | null
  pacing?: AdPacing
}): PlacedAd[] {
  const { completedAnswerIds, placedAds, drawAd, pacing } = params
  const placedAnchors = new Set(placedAds.map((p) => p.afterMessageId))
  const usedImpUrls = new Set(placedAds.map((p) => p.ad.impUrl))
  const additions: PlacedAd[] = []
  for (const anchorId of inlineAdAnchorIds(completedAnswerIds, pacing)) {
    if (placedAnchors.has(anchorId)) continue
    const ad = drawUnusedAd(drawAd, usedImpUrls)
    if (!ad) break
    additions.push({ ad, afterMessageId: anchorId })
    usedImpUrls.add(ad.impUrl)
  }
  return additions
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
   *  landing screen, which has no conversation but still needs ads. */
  forceStart?: boolean
  /** Ad network to request first. The server owns fallback ordering. */
  provider?: AdProvider
  /** Product surface requesting the ad. The server maps this to placements. */
  surface?: AdSurface
  /**
   * Interleave ads into the chat transcript (spaced every few exchanges,
   * pinned in scrollback) instead of exposing a single rotating `ads[0]` slot.
   * When set, {@link GravityAdState.placedAds} is populated for the caller to
   * render inline. The rotating `ads` field still drives ad fetching.
   */
  inline?: boolean
}): GravityAdState => {
  const enabled = options?.enabled ?? true
  const forceStart = options?.forceStart ?? false
  const provider: AdProvider = options?.provider ?? 'gravity'
  const surface = options?.surface
  const inline = options?.inline ?? false
  const [ads, setAds] = useState<AdResponse[] | null>(null)
  const [placedAds, setPlacedAds] = useState<PlacedAd[]>([])
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
    if (ctrl.impressionsFired.has(impUrl)) return
    ctrl.impressionsFired.add(impUrl)

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
      body: JSON.stringify({ impUrl: ad.impUrl, surface: surface ?? 'chat' }),
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
  const fetchAd = async (): Promise<FetchAdResult> => {
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

        const result = canFetchNew ? await fetchAd() : null

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
      const result = await fetchAd()
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

  // Count of completed assistant answers (a top-level 'ai' message whose turn
  // has finished). This is the only transcript signal placement cares about — it
  // ticks up when a turn completes, NOT on every streamed token, so subscribing
  // to it here doesn't re-render the caller mid-stream.
  const completedAnswerCount = useChatStore((s) => {
    if (!inline) return 0
    let count = 0
    for (const m of s.messages) {
      if (isCompletedAnswer(m)) count++
    }
    return count
  })

  // Anchor a new ad below completed assistant answers per the pacing knobs,
  // drawing from the same rotation cache the slot ad cycles through. Placement is
  // append-only and idempotent (an anchor is filled once, never moved or
  // re-drawn), so ads stay put in scrollback. Re-runs on `ads` retry any anchor
  // that couldn't be filled while the cache was still empty.
  useEffect(() => {
    if (!inline || shouldHideAds || !getAdsEnabled()) return

    const completedAnswerIds = useChatStore
      .getState()
      .messages.filter(isCompletedAnswer)
      .map((m) => m.id)

    const additions = computeInlineAdAdditions({
      completedAnswerIds,
      placedAds,
      drawAd: () => nextFromChoiceCache(ctrlRef.current)?.[0] ?? null,
    })

    if (additions.length > 0) setPlacedAds((prev) => [...prev, ...additions])
  }, [inline, shouldHideAds, completedAnswerCount, ads, placedAds])

  // Don't return ads when ads should be hidden
  const visible = shouldStart && !shouldHideAds
  return {
    ads: visible ? ads : null,
    placedAds: visible ? placedAds : [],
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
