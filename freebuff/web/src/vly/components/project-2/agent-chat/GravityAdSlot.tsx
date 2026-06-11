'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/vly/lib/utils'
import { recordAdEvent } from '@/lib/record-ad-event'

const AD_COOLDOWN_MS = 60_000
const AD_DEBOUNCE_MS = 2_000

export type GravityAdMessage = { role: string; content: string }

export type GravityAd = {
  adText: string
  title: string
  cta: string
  brandName: string
  url: string
  favicon?: string
  impUrl: string
  clickUrl: string
  placementId?: string
  provider?: string
}

export type GravityAdSurface = 'freebuff_web_chat'

export type GravityContext = {
  sessionId: string
  user: {
    userId: string
    emailHash?: string
  }
  device: {
    screenWidth?: number
    screenHeight?: number
    timezone?: string
    locale?: string
    language?: string
    userAgent?: string
    platform?: string
  }
}

async function sha256Hex(value: string): Promise<string | undefined> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined

  const input = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Mirrors the Gravity client context payload recommended by the client SDK.
 * The installed @gravity-ai/api package does not expose gravityContext() yet,
 * so keep this payload local and switch to the SDK helper when it is published.
 */
async function buildGravityContext(params: {
  sessionId: string
  userId?: string | null
  email?: string | null
}): Promise<GravityContext> {
  const normalizedEmail = params.email?.trim().toLowerCase()
  const emailHash = normalizedEmail
    ? await sha256Hex(normalizedEmail)
    : undefined

  return {
    sessionId: params.sessionId,
    user: {
      userId: params.userId ?? params.sessionId,
      ...(emailHash ? { emailHash } : {}),
    },
    device: {
      ...(typeof screen !== 'undefined'
        ? {
            screenWidth: screen.width,
            screenHeight: screen.height,
          }
        : {}),
      ...(typeof Intl !== 'undefined'
        ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : {}),
      ...(typeof navigator !== 'undefined'
        ? {
            locale: navigator.language,
            language: navigator.language,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
          }
        : {}),
    },
  }
}

// Impressions already reported, so a re-rendered or remounted slot doesn't
// double-report. (The server dedupes too; this just avoids redundant requests.)
const reportedImpUrls = new Set<string>()

/** Placement ID sent to Gravity for reporting/targeting. */
const PLACEMENT_CHAT = 'agent-chat-below-response'
const PLACEMENT_CENTER = 'project-center'
const PLACEMENT_SIDEBAR = 'project-sidebar'

/**
 * Client-side fetch to Freebuff's same-origin ads proxy.
 * The route forwards to Codebuff's ads API so provider fallback and ad
 * impression logging remain consistent with the CLI.
 */
function parseGravityAds(data: unknown): GravityAd[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as { ads?: unknown }).ads)
  ) {
    return []
  }

  const provider = (data as { provider?: string }).provider
  return (data as { ads: unknown[] }).ads.flatMap((raw) => {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as { adText?: unknown }).adText !== 'string' ||
      typeof (raw as { impUrl?: unknown }).impUrl !== 'string' ||
      typeof (raw as { clickUrl?: unknown }).clickUrl !== 'string'
    ) {
      return []
    }

    return [
      {
        adText: (raw as { adText: string }).adText,
        title: (raw as { title?: string }).title ?? '',
        cta: (raw as { cta?: string }).cta ?? '',
        brandName: (raw as { brandName?: string }).brandName ?? '',
        url: (raw as { url?: string }).url ?? '',
        favicon: (raw as { favicon?: string }).favicon,
        impUrl: (raw as { impUrl: string }).impUrl,
        clickUrl: (raw as { clickUrl: string }).clickUrl,
        placementId: (raw as { placementId?: string }).placementId,
        provider,
      },
    ]
  })
}

export async function fetchGravityAds(
  messages: GravityAdMessage[],
  sessionId: string,
  testAd: boolean,
  placement?: 'center' | 'sidebar',
  gravityContext?: GravityContext,
  surface?: GravityAdSurface,
): Promise<GravityAd[]> {
  const placementId =
    placement === 'center'
      ? PLACEMENT_CENTER
      : placement === 'sidebar'
        ? PLACEMENT_SIDEBAR
        : PLACEMENT_CHAT

  // Use unique sessionId per placement to avoid Gravity's per-session deduplication
  // This allows multiple ad slots to each receive their own ad
  const uniqueSessionId = `${sessionId}-${placementId}`

  const body = {
    messages,
    sessionId: uniqueSessionId,
    testAd,
    ...(gravityContext
      ? {
          gravity_context: {
            ...gravityContext,
            sessionId: uniqueSessionId,
          },
        }
      : {}),
    ...(surface ? { surface } : {}),
  }

  try {
    // Use AbortController with 3s timeout to prevent long waits
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    console.log(
      `[GravityAdSlot] Fetching ad for placement: ${placementId}, sessionId: ${uniqueSessionId}`,
    )

    const res = await fetch('/api/ads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    console.log(
      `[GravityAdSlot] Response for ${placementId}: status=${res.status}`,
    )

    if (res.status === 204 || !res.ok) {
      console.log(
        `[GravityAdSlot] No ad returned for ${placementId} (status: ${res.status})`,
      )
      return []
    }

    const data = (await res.json()) as unknown
    console.log(`[GravityAdSlot] Data for ${placementId}:`, data)

    const ads = parseGravityAds(data)
    if (ads.length === 0) {
      console.log(`[GravityAdSlot] Empty or invalid data for ${placementId}`)
      return []
    }

    return ads
  } catch {
    return []
  }
}

export async function fetchGravityAd(
  messages: GravityAdMessage[],
  sessionId: string,
  testAd: boolean,
  placement?: 'center' | 'sidebar',
  gravityContext?: GravityContext,
): Promise<GravityAd | null> {
  return (
    (
      await fetchGravityAds(
        messages,
        sessionId,
        testAd,
        placement,
        gravityContext,
      )
    )[0] ?? null
  )
}

type GravityAdSlotProps = {
  messages: GravityAdMessage[]
  sessionId: string
  /** Stable id for this slot (e.g. message._id) so we only fetch once per message */
  slotKey?: string
  testAd?: boolean
  /** "featured" = larger (e.g. in chat); "compact" = smaller (sidebar); "default" = standard (center) */
  variant?: 'default' | 'featured' | 'compact'
  /** Placement for Gravity: "center" | "sidebar" for project center/sidebar; omit for chat. */
  placement?: 'center' | 'sidebar'
  /** Called when an ad is successfully loaded and rendered (e.g. to show disclaimer only when ad is visible). */
  onAdRendered?: () => void
  /** When true, show "Promotions help keep vly affordable." below the ad (e.g. in chat). */
  showDisclaimer?: boolean
  className?: string
}

/**
 * Fetches and displays a Gravity contextual ad. Fires impression when in view.
 * Request runs once on mount with the given messages/sessionId.
 */
export function GravityAdSlot({
  messages,
  sessionId,
  slotKey,
  testAd = false,
  variant = 'default',
  placement,
  onAdRendered,
  showDisclaimer = false,
  className,
}: GravityAdSlotProps) {
  const [ad, setAd] = useState<GravityAd | null>(null)
  const [faviconError, setFaviconError] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [shouldFireImpression, setShouldFireImpression] = useState(false)
  const { data: session } = useSession()

  const adCardRef = useRef<HTMLDivElement | null>(null)
  const lastFetchRef = useRef<number>(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stabilize messages by content to avoid re-fetches on reference changes (e.g. during streaming)
  const stableMessagesKey = useMemo(
    () =>
      JSON.stringify(
        messages.map((m) => ({ r: m.role, c: m.content.slice(0, 200) })),
      ),
    [messages],
  )

  const requestMessages = useMemo(
    () =>
      messages.length > 0
        ? messages
        : [{ role: 'user', content: 'Building my app' }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableMessagesKey],
  )

  // Track page visibility to avoid fetching ads when tab is hidden
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true,
  )

  useEffect(() => {
    const handler = () => setIsTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    if (ad) onAdRendered?.()
  }, [ad, onAdRendered])

  useEffect(() => {
    setShouldFireImpression(false)
    const root = adCardRef.current
    if (!ad || !root) return

    if (typeof IntersectionObserver === 'undefined') {
      setShouldFireImpression(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldFireImpression(true)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )

    observer.observe(root)
    return () => observer.disconnect()
  }, [ad])

  // Report the impression server-side once the ad is in view; the server
  // fires Gravity's pixel itself, so tracking works even with ad blockers.
  useEffect(() => {
    if (!shouldFireImpression || !ad) return
    if (reportedImpUrls.has(ad.impUrl)) return
    reportedImpUrls.add(ad.impUrl)
    recordAdEvent('impression', ad.impUrl, 'web')
  }, [shouldFireImpression, ad])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const doFetch = useCallback(
    (immediate: boolean) => {
      if (!isTabVisible) return

      const now = Date.now()
      if (
        !immediate &&
        lastFetchRef.current > 0 &&
        now - lastFetchRef.current < AD_COOLDOWN_MS
      )
        return

      const run = () => {
        lastFetchRef.current = Date.now()
        buildGravityContext({
          sessionId,
          userId: session?.user?.id,
          email: session?.user?.email,
        })
          .then((gravityContext) =>
            fetchGravityAd(
              requestMessages,
              sessionId,
              testAd,
              placement,
              gravityContext,
            ),
          )
          .then((result) => {
            if (mountedRef.current && result) setAd(result)
          })
          .catch(() => {})
          .finally(() => {
            if (mountedRef.current) setHasFetched(true)
          })
      }

      if (immediate) {
        run()
      } else {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(run, AD_DEBOUNCE_MS)
      }
    },
    [
      isTabVisible,
      requestMessages,
      sessionId,
      testAd,
      placement,
      session?.user?.id,
      session?.user?.email,
    ],
  )

  // Initial fetch (immediate) and re-fetch on meaningful changes (debounced + cooldown)
  const isInitialFetch = useRef(true)
  useEffect(() => {
    if (isInitialFetch.current) {
      isInitialFetch.current = false
      doFetch(true)
    } else {
      doFetch(false)
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, testAd, placement, slotKey, stableMessagesKey, isTabVisible])

  if (!hasFetched || !ad) return null

  const isFeatured = variant === 'featured'
  const isCompact = variant === 'compact'

  const adCard = (
    <div
      ref={adCardRef}
      className={cn(
        'relative rounded-lg',
        isFeatured && 'mt-2.5',
        isCompact && 'mt-2',
        !isFeatured && !isCompact && 'mt-3',
        className,
      )}
    >
      {/* Clicks: redirect to clickUrl; Gravity handles attribution and redirects to the landing page */}
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => recordAdEvent('click', ad.impUrl, 'web')}
        className="group flex overflow-hidden rounded-lg border border-border bg-card text-left no-underline outline-none transition-colors hover:border-primary/40 hover:bg-muted/30 focus:ring-2 focus:ring-primary/30"
      >
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden border-r border-border bg-muted font-medium text-muted-foreground',
            isFeatured && 'w-14 text-xs sm:w-16',
            isCompact && 'w-10 text-[10px]',
            !isFeatured && !isCompact && 'w-12 text-xs',
          )}
        >
          {ad.favicon && !faviconError ? (
            <img
              src={ad.favicon}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setFaviconError(true)}
            />
          ) : null}
          <span
            className={cn(
              'relative z-[1]',
              ad.favicon && !faviconError ? 'invisible' : '',
            )}
          >
            {ad.brandName.charAt(0).toUpperCase() || 'Ad'}
          </span>
        </div>
        <div
          className={cn(
            'min-w-0 flex-1 overflow-hidden',
            isFeatured && 'px-3 py-2.5',
            isCompact && 'px-2 py-1.5',
            !isFeatured && !isCompact && 'px-3 py-2',
          )}
        >
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Sponsored
          </span>
          <span
            className={cn(
              'block truncate font-semibold text-foreground',
              isFeatured && 'text-sm',
              isCompact && 'text-xs',
              !isFeatured && !isCompact && 'text-sm',
            )}
          >
            {ad.title || ad.brandName}
          </span>
          <p
            className={cn(
              'mt-0.5 break-words leading-snug text-muted-foreground',
              isFeatured && 'line-clamp-2 text-sm',
              isCompact && 'line-clamp-2 text-[11px]',
              !isFeatured && !isCompact && 'line-clamp-2 text-xs',
            )}
          >
            {ad.adText}
          </p>
          <span
            className={cn(
              'mt-2 inline-flex items-center gap-1 font-medium text-muted-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline',
              isCompact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {ad.cta || 'Learn more'}
            <ExternalLink
              className={cn(
                'shrink-0',
                isCompact && 'h-2.5 w-2.5',
                !isCompact && 'h-3 w-3',
              )}
            />
          </span>
        </div>
      </a>
    </div>
  )

  return (
    <>
      {adCard}
      {showDisclaimer && (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          Promotions help keep vly affordable.
        </p>
      )}
    </>
  )
}
