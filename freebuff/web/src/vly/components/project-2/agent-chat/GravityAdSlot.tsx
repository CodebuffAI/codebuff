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
export async function buildGravityContext(params: {
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
const PLACEMENT_CENTER = 'project-center'
const PLACEMENT_SIDEBAR = 'project-sidebar'
const PLACEMENT_ABOVE_IFRAME = 'Above-iFrame'

type GravityPlacement = 'center' | 'sidebar' | 'above-iframe'

function getPlacementId(placement?: GravityPlacement) {
  switch (placement) {
    case 'center':
      return PLACEMENT_CENTER
    case 'sidebar':
      return PLACEMENT_SIDEBAR
    case 'above-iframe':
      return PLACEMENT_ABOVE_IFRAME
    default:
      return undefined
  }
}

function getFallbackFaviconUrl(url: string) {
  try {
    const hostname = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return ''
  }
}

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
  placement?: GravityPlacement,
  gravityContext?: GravityContext,
  surface?: GravityAdSurface,
): Promise<GravityAd[]> {
  const placementId = getPlacementId(placement)

  // Use a stable per-slot session id when a specific placement is requested.
  // Chat intentionally omits placementId so the backend can request both
  // Freebuff Web chat placements in one auction.
  const requestSessionId = placementId
    ? `${sessionId}-${placementId}`
    : `${sessionId}-freebuff-web-chat`

  const body = {
    messages,
    sessionId: requestSessionId,
    testAd,
    ...(placementId ? { placementId } : {}),
    ...(gravityContext
      ? {
          gravity_context: {
            ...gravityContext,
            sessionId: requestSessionId,
          },
        }
      : {}),
    ...(surface ? { surface } : {}),
  }

  try {
    // Use AbortController with 3s timeout to prevent long waits
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch('/api/ads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (res.status === 204 || !res.ok) {
      return []
    }

    const data = (await res.json()) as unknown

    const ads = parseGravityAds(data)
    if (ads.length === 0) {
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
  placement?: GravityPlacement,
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
  /** "featured" = larger (e.g. in chat); "compact" = smaller (sidebar); "nav" = full-width iframe chrome. */
  variant?: 'default' | 'featured' | 'compact' | 'nav'
  /** Placement for Gravity: "center" | "sidebar" | "above-iframe"; omit for chat. */
  placement?: GravityPlacement
  /** Optional house ad shown when Gravity returns no paid inventory. */
  fallbackAd?: GravityAd
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
  fallbackAd,
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
    if (!ad.impUrl) return
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
            if (mountedRef.current) setAd(result ?? fallbackAd ?? null)
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
      fallbackAd,
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
  const isNav = variant === 'nav'
  const imageUrl =
    !faviconError && (ad.favicon || (isNav ? getFallbackFaviconUrl(ad.url) : ''))

  // Inline toolbar variant: borderless row that blends into the iframe
  // control card (logo · title · CTA · faded "AD"), no card chrome.
  if (isNav) {
    return (
      <div ref={adCardRef} className={cn('flex min-w-0', className)}>
        <a
          href={ad.clickUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => {
            if (ad.impUrl) recordAdEvent('click', ad.impUrl, 'web')
          }}
          aria-label={`Sponsored: ${ad.title || ad.brandName}`}
          className="group flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 no-underline outline-none transition-colors hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-primary/40"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-[9px] font-semibold text-muted-foreground">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setFaviconError(true)}
              />
            ) : (
              ad.brandName.charAt(0).toUpperCase() || 'A'
            )}
          </span>
          <span
            title={ad.adText ? `${ad.title || ad.brandName} — ${ad.adText}` : undefined}
            className="min-w-0 flex-1 truncate text-[11px] leading-tight text-foreground/85 transition-all group-hover:whitespace-normal"
          >
            <span className="font-medium">{ad.title || ad.brandName}</span>
            {ad.adText ? (
              <span className="ml-1.5 font-normal text-muted-foreground/70">
                {ad.adText}
              </span>
            ) : null}
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold leading-none text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90 sm:inline-flex">
            {ad.cta || 'Start monetizing'}
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </span>
          <span className="shrink-0 text-[8px] font-semibold uppercase leading-none tracking-[0.2em] text-muted-foreground/30">
            AD
          </span>
        </a>
      </div>
    )
  }

  const adCard = (
    <div
      ref={adCardRef}
      className={cn(
        'relative rounded-lg',
        isFeatured && 'mt-2.5',
        isCompact && 'mt-2',
        !isFeatured && !isCompact && !isNav && 'mt-3',
        className,
      )}
    >
      {/* Clicks: redirect to clickUrl; Gravity handles attribution and redirects to the landing page */}
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => {
          if (ad.impUrl) recordAdEvent('click', ad.impUrl, 'web')
        }}
        className={cn(
          'group flex overflow-hidden rounded-lg border border-border bg-card text-left no-underline outline-none transition-colors hover:border-primary/40 hover:bg-muted/30 focus:ring-2 focus:ring-primary/30',
          isNav &&
            'relative min-h-[36px] items-center rounded-md border-border/70 bg-background/35',
        )}
      >
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden border-r border-border bg-muted font-medium text-muted-foreground',
            isFeatured && 'w-14 text-xs sm:w-16',
            isCompact && 'w-10 text-[10px]',
            isNav &&
              'ml-1.5 mr-2 h-5 w-5 rounded border border-border/70 text-[9px]',
            !isFeatured && !isCompact && !isNav && 'w-12 text-xs',
          )}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setFaviconError(true)}
            />
          ) : null}
          <span
            className={cn(
              'relative z-[1]',
              imageUrl ? 'invisible' : '',
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
            isNav && 'py-1.5 pr-24',
            !isFeatured && !isCompact && !isNav && 'px-3 py-2',
          )}
        >
          <span
            className={cn(
              'block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70',
              isNav
                ? 'absolute right-2 top-1 mb-0 text-[8px] tracking-[0.18em] text-muted-foreground/25'
                : 'mb-1',
            )}
          >
            {isNav ? 'AD' : 'Sponsored'}
          </span>
          <span
            className={cn(
              'block truncate font-semibold text-foreground',
              isFeatured && 'text-sm',
              isCompact && 'text-xs',
              isNav && 'text-[11px] leading-tight',
              !isFeatured && !isCompact && !isNav && 'text-sm',
            )}
          >
            {ad.title || ad.brandName}
          </span>
          <p
            className={cn(
              'mt-0.5 break-words leading-snug text-muted-foreground',
              isFeatured && 'line-clamp-2 text-sm',
              isCompact && 'line-clamp-2 text-[11px]',
              isNav && 'line-clamp-1 text-[10px]',
              !isFeatured && !isCompact && !isNav && 'line-clamp-2 text-xs',
            )}
          >
            {ad.adText}
          </p>
          <span
            className={cn(
              'inline-flex items-center gap-1 font-medium text-muted-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline',
              isNav
                ? 'absolute bottom-1.5 right-1.5 mt-0 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-semibold leading-none text-primary group-hover:bg-primary/20 group-hover:no-underline'
                : 'mt-2',
              isCompact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {ad.cta || (isNav ? 'Start monetizing' : 'Learn more')}
            <ExternalLink
              className={cn(
                'shrink-0',
                (isCompact || isNav) && 'h-2.5 w-2.5',
                !isCompact && !isNav && 'h-3 w-3',
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
