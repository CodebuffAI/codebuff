import { WEBSITE_URL } from '@codebuff/sdk'
import { useEffect, useMemo, useRef, useState } from 'react'

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

// Inline ads are auctioned as a batch per user prompt and handed to the
// response renderer to intersperse between the response's rendered sections.
// How many actually show (0 to all 8) scales with the response length: a
// one-shot answer shows none, longer tool-using runs show more.
export const ADS_PER_PROMPT = 8

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
   * Batch ads keyed by assistant message id, for the response renderer to
   * intersperse between the message's rendered sections.
   */
  responseAds: Record<string, AdResponse[]>
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
  batchPromptIds: Set<string> // Prompt message ids a batch fetch has started for
  batchImpUrls: Set<string> // Every impUrl handed out in a prompt batch (never reused)
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
 * A genuine user prompt — the trigger for a batch ad auction and the anchor
 * for the first ad of the batch. Excludes bash `!command` echoes (they carry
 * `metadata.bashCwd`) and slash-command echoes, which don't start a response.
 */
export function isPromptMessage(m: ChatMessage): boolean {
  return (
    !m.parentId &&
    m.variant === 'user' &&
    !m.metadata?.bashCwd &&
    !m.content.trimStart().startsWith('/')
  )
}

/**
 * A streamed LLM answer (possibly still in flight). Other top-level
 * 'ai'-variant messages (bash echoes, system notices, mode dividers) are
 * excluded via the `ai-` id prefix.
 */
export function isAnswerMessage(m: ChatMessage): boolean {
  return (
    !m.parentId &&
    m.variant === 'ai' &&
    m.id.startsWith(AI_MESSAGE_ID_PREFIX)
  )
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

/** The batch of ads auctioned when a user prompt was sent. */
export type PromptAdBatch = {
  promptMessageId: string
  ads: AdResponse[]
}

/**
 * Pure helper: map fetched prompt batches onto the transcript. Each batch is
 * keyed to the first assistant answer that follows its prompt, so the response
 * renderer can intersperse the ads between that answer's rendered sections.
 * Purely derived from (messages, batches), so placements are stable as the
 * transcript appends and idempotent across re-renders.
 */
export function computeResponseAds(params: {
  messages: ChatMessage[]
  batches: PromptAdBatch[]
}): Record<string, AdResponse[]> {
  const { messages, batches } = params
  const batchByPrompt = new Map(batches.map((b) => [b.promptMessageId, b]))

  const responseAds: Record<string, AdResponse[]> = {}
  let pendingAds: AdResponse[] | null = null

  for (const m of messages) {
    if (m.parentId) continue
    if (isPromptMessage(m)) {
      const batch = batchByPrompt.get(m.id)
      pendingAds = batch && batch.ads.length > 0
        ? batch.ads.slice(0, ADS_PER_PROMPT)
        : null
    } else if (isAnswerMessage(m) && pendingAds) {
      responseAds[m.id] = pendingAds
      pendingAds = null
    }
  }

  return responseAds
}

/**
 * Hook for fetching and rotating Gravity ads.
 *
 * Behavior:
 * - Ads only start after the user sends their first message
 * - The `ads[0]` slot (rendered above the input box) rotates every 60 seconds
 * - After 3 rotations without user activity, stops fetching new ads but
 *   continues cycling cached ads; any user activity resumes fetching
 * - With `inline`, every user prompt additionally auctions a batch of
 *   {@link ADS_PER_PROMPT} ads that the block renderer intersperses in the
 *   assistant response (0 shown for a one-shot answer, more as it grows)
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
   * In addition to the rotating `ads[0]` slot, auction a batch of
   * {@link ADS_PER_PROMPT} ads on every user prompt for the response renderer
   * to intersperse in the assistant response
   * ({@link GravityAdState.responseAds}).
   */
  inline?: boolean
  /**
   * Explicit provider placement id for the rotating `ads[0]` slot fetches,
   * so they're auctioned separately from the per-prompt inline batch.
   */
  slotPlacementId?: string
}): GravityAdState => {
  const enabled = options?.enabled ?? true
  const forceStart = options?.forceStart ?? false
  const provider: AdProvider = options?.provider ?? 'gravity'
  const surface = options?.surface
  const inline = options?.inline ?? false
  const slotPlacementId = options?.slotPlacementId
  const [ads, setAds] = useState<AdResponse[] | null>(null)
  const [adBatches, setAdBatches] = useState<PromptAdBatch[]>([])
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
    batchPromptIds: new Set(),
    batchImpUrls: new Set(),
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

  // Latest user prompt in the transcript. Changes exactly when the user sends
  // a new prompt (never on streamed tokens), so it doubles as the trigger for
  // the per-prompt batch auction.
  const latestPromptId = useChatStore((s) => {
    if (!inline) return null
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i]!
      if (isPromptMessage(m)) return m.id
    }
    return null
  })

  // Auction a batch of ADS_PER_PROMPT ads for every user prompt (one API call
  // returning all inline placements). If the provider under-fills, top the
  // batch up with unused ads from the rotation cache so the prompt slot still
  // shows something. Each prompt is fetched at most once.
  useEffect(() => {
    if (!inline || shouldHideAds || !getAdsEnabled() || !latestPromptId) return
    const ctrl = ctrlRef.current
    if (ctrl.batchPromptIds.has(latestPromptId)) return
    ctrl.batchPromptIds.add(latestPromptId)

    // A prompt whose answer has already settled was restored from a previous
    // session (a live prompt is seen here before its answer completes). Don't
    // retroactively auction ads into settled history.
    const messages = useChatStore.getState().messages
    const promptIndex = messages.findIndex((m) => m.id === latestPromptId)
    const alreadyAnswered = messages
      .slice(promptIndex + 1)
      .some((m) => isAnswerMessage(m) && m.isComplete)
    if (alreadyAnswered) return

    void (async () => {
      const result = await fetchAd()
      const batchAds = (result?.ads ?? []).filter(
        (ad) => !ctrl.batchImpUrls.has(ad.impUrl),
      )
      const usedImpUrls = new Set([
        ...ctrl.batchImpUrls,
        ...batchAds.map((ad) => ad.impUrl),
      ])
      while (batchAds.length < ADS_PER_PROMPT) {
        const ad = drawUnusedAd(
          () => nextFromChoiceCache(ctrl)?.[0] ?? null,
          usedImpUrls,
        )
        if (!ad) break
        batchAds.push(ad)
        usedImpUrls.add(ad.impUrl)
      }
      if (batchAds.length === 0) return
      for (const ad of batchAds) ctrl.batchImpUrls.add(ad.impUrl)
      setAdBatches((prev) => [
        ...prev,
        { promptMessageId: latestPromptId, ads: batchAds },
      ])
    })()
  }, [inline, shouldHideAds, latestPromptId])

  // Transcript shape signature: which top-level messages exist and what kind
  // they are. Changes when a message is added — not on streamed content — so
  // placement recomputes exactly when a new anchor could appear.
  const transcriptSignature = useChatStore((s) => {
    if (!inline) return ''
    let sig = ''
    for (const m of s.messages) {
      if (m.parentId) continue
      sig += `${m.id}:${m.variant};`
    }
    return sig
  })

  // Recomputes when the transcript shape or the batches change; reads the full
  // messages at that moment (their streamed content doesn't affect placement).
  const responseAds = useMemo(() => {
    if (!inline) return {}
    return computeResponseAds({
      messages: useChatStore.getState().messages,
      batches: adBatches,
    })
  }, [inline, transcriptSignature, adBatches])

  // Don't return ads when ads should be hidden
  const visible = shouldStart && !shouldHideAds
  return {
    ads: visible ? ads : null,
    responseAds: visible ? responseAds : {},
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
