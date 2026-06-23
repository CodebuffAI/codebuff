'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gravityContext, hashPii } from '@gravity-ai/api'
import { GravityAd as GravityReactAd, useAdTracking } from '@gravity-ai/react'
import { useSession } from 'next-auth/react'

import type { RefObject } from 'react'

import { cn } from '@/vly/lib/utils'
import { trackRedditGravityAdClick } from '@/lib/reddit-funnel'

import type {
  GravityContext as GravitySdkContext,
  HashedIdentity,
} from '@gravity-ai/api'
import type { AdResponse } from '@gravity-ai/react'

const AD_COOLDOWN_MS = 60_000
const AD_DEBOUNCE_MS = 2_000
/** How long the above-iframe nav ad stays pinned before we allow a refresh. */
const NAV_AD_TTL_MS = 30 * 60 * 1000

export type GravityAdMessage = { role: string; content: string }

export type GravityAd = AdResponse & {
  adText: string
  title: string
  cta: string
  brandName: string
  url: string
  favicon?: string
  impUrl: string
  clickUrl: string
  placementId?: string
  placement_id?: string
  provider?: string
}

function navAdCacheKey(slotKey: string, sessionId: string) {
  return `freebuff-gravity-nav-ad:${slotKey || sessionId}`
}

function readNavAdCache(key: string): GravityAd | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ad?: GravityAd; fetchedAt?: number }
    if (
      !parsed.ad ||
      typeof parsed.fetchedAt !== 'number' ||
      Date.now() - parsed.fetchedAt > NAV_AD_TTL_MS
    ) {
      window.sessionStorage.removeItem(key)
      return null
    }
    return parsed.ad
  } catch {
    return null
  }
}

function writeNavAdCache(key: string, ad: GravityAd) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ad, fetchedAt: Date.now() }),
    )
  } catch {
    // sessionStorage full or unavailable — ad still renders, just won't persist
  }
}

export type GravityAdSurface = 'freebuff_web_chat'
export type GravityContext = GravitySdkContext

export async function buildGravityContext(params: {
  sessionId: string
  userId?: string | null
  email?: string | null
}): Promise<GravityContext> {
  let hashedIdentity: HashedIdentity = {}
  try {
    hashedIdentity = await hashPii({ email: params.email })
  } catch {
    hashedIdentity = {}
  }

  return gravityContext({
    sessionId: params.sessionId,
    user: {
      userId: params.userId ?? params.sessionId,
      ...hashedIdentity,
    },
  })
}

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

    const placementId =
      (raw as { placementId?: string }).placementId ??
      (raw as { placement_id?: string }).placement_id

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
        placementId,
        placement_id: placementId,
        provider,
      },
    ]
  })
}

export async function fetchGravityAds(
  messages: GravityAdMessage[],
  sessionId: string,
  placement?: GravityPlacement,
  gravityContextPayload?: GravityContext,
  surface?: GravityAdSurface,
): Promise<GravityAd[]> {
  const placementId = getPlacementId(placement)
  const requestSessionId = placementId
    ? `${sessionId}-${placementId}`
    : `${sessionId}-freebuff-web-chat`

  const body = {
    messages,
    sessionId: requestSessionId,
    ...(placementId ? { placementId } : {}),
    ...(gravityContextPayload
      ? {
          gravity_context: {
            ...gravityContextPayload,
            sessionId: requestSessionId,
          },
        }
      : {}),
    ...(surface ? { surface } : {}),
  }

  try {
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

    return parseGravityAds(await res.json())
  } catch {
    return []
  }
}

export async function fetchGravityAd(
  messages: GravityAdMessage[],
  sessionId: string,
  placement?: GravityPlacement,
  gravityContextPayload?: GravityContext,
): Promise<GravityAd | null> {
  return (
    (
      await fetchGravityAds(
        messages,
        sessionId,
        placement,
        gravityContextPayload,
      )
    )[0] ?? null
  )
}

type GravityAdSlotProps = {
  messages: GravityAdMessage[]
  sessionId: string
  /** Stable id for this slot (e.g. message._id) so we only fetch once per message */
  slotKey?: string
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
 * Compact, theme-aware ad for the preview toolbar (above the iframe).
 *
 * The library's `toolbar` variant only renders brand + title with a hard-coded
 * black CTA pill and no room for a description, so we render our own minimal
 * layout while reusing the library's `useAdTracking` hook to keep impression
 * and click reporting intact.
 */
function NavAd({ ad, className }: { ad: GravityAd; className?: string }) {
  const { containerRef, handleClick } = useAdTracking({ ad })
  // adText is the promotional body copy; title is often a short headline that
  // duplicates brandName. Prefer adText so the toolbar shows as much description
  // as the available width allows (CSS truncate handles the rest).
  const rawDescription = ad.adText?.trim() || ad.title?.trim() || ''
  const brand = ad.brandName?.trim() ?? ''
  const description =
    brand && rawDescription.toLowerCase().startsWith(brand.toLowerCase())
      ? rawDescription.slice(brand.length).trim()
      : rawDescription
  const href = ad.clickUrl || ad.url || undefined

  return (
    <a
      ref={containerRef as unknown as RefObject<HTMLAnchorElement>}
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={(e) => {
        handleClick()
        trackRedditGravityAdClick('web')
        if (!href) e.preventDefault()
      }}
      data-gravity-ad
      className={cn(
        // Fill the toolbar's flex-1 slot; truncate reacts to whatever width
        // is left after nav controls + status buttons.
        'group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-0.5 text-foreground/80 no-underline transition hover:bg-muted/50',
        className,
      )}
    >
      {ad.favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.favicon}
          alt=""
          loading="lazy"
          className="h-4 w-4 shrink-0 rounded-sm object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      {brand ? (
        <span className="shrink-0 text-[11px] font-semibold text-foreground">
          {brand}
        </span>
      ) : null}
      {description ? (
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      ) : (
        // Reserve flex space so the CTA stays right-aligned when there's no
        // body copy (keeps brand + label + CTA layout stable).
        <span className="min-w-0 flex-1" aria-hidden />
      )}
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground/40">
        Ad
      </span>
      {ad.cta ? (
        <span className="shrink-0 rounded-md bg-foreground/[0.08] px-2 py-1 text-[10px] font-medium text-foreground/90 transition group-hover:bg-foreground/[0.14]">
          {ad.cta}
        </span>
      ) : null}
    </a>
  )
}

export function GravityAdSlot({
  messages,
  sessionId,
  slotKey,
  variant = 'default',
  placement,
  fallbackAd,
  onAdRendered,
  showDisclaimer = false,
  className,
}: GravityAdSlotProps) {
  const isStickyNav = variant === 'nav'
  const navCacheKey = useMemo(
    () => (isStickyNav ? navAdCacheKey(slotKey ?? '', sessionId) : ''),
    [isStickyNav, slotKey, sessionId],
  )

  const [ad, setAd] = useState<GravityAd | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const { data: session } = useSession()

  const lastFetchRef = useRef<number>(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

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

  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true,
  )

  useEffect(() => {
    const handler = () => setIsTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (ad) onAdRendered?.()
  }, [ad, onAdRendered])

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
          .then((gravityContextPayload) =>
            fetchGravityAd(
              requestMessages,
              sessionId,
              placement,
              gravityContextPayload,
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
      placement,
      fallbackAd,
      session?.user?.id,
      session?.user?.email,
    ],
  )

  const isInitialFetch = useRef(true)

  // Sticky nav ad: one fetch per project slot, cached in sessionStorage for
  // NAV_AD_TTL_MS. Ignores message edits, tab visibility, and the 60s chat
  // cooldown so the toolbar ad doesn't rotate every minute.
  useEffect(() => {
    if (!isStickyNav || !navCacheKey) return

    const cached = readNavAdCache(navCacheKey)
    if (cached) {
      setAd(cached)
      setHasFetched(true)
      return
    }

    let cancelled = false
    buildGravityContext({
      sessionId,
      userId: session?.user?.id,
      email: session?.user?.email,
    })
      .then((gravityContextPayload) =>
        fetchGravityAd(
          requestMessages,
          sessionId,
          placement,
          gravityContextPayload,
        ),
      )
      .then((result) => {
        if (cancelled || !mountedRef.current) return
        const next = result ?? fallbackAd ?? null
        setAd(next)
        if (next) writeNavAdCache(navCacheKey, next)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && mountedRef.current) setHasFetched(true)
      })

    return () => {
      cancelled = true
    }
    // Only re-pin when the project slot changes — not on message/tab churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStickyNav, navCacheKey, sessionId, placement])

  useEffect(() => {
    if (isStickyNav) return

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
  }, [sessionId, placement, slotKey, stableMessagesKey, isTabVisible, isStickyNav])

  if (!hasFetched || !ad) return null

  if (variant === 'nav') {
    return <NavAd ad={ad} className={className} />
  }

  const isCompact = variant === 'compact'
  const adVariant = isCompact ? 'inline' : 'card'
  const slotProps = {
    container: {
      style: {
        width: '100%',
        background: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
        borderColor: 'hsl(var(--border))',
      },
    },
    brand: { style: { color: 'hsl(var(--foreground))' } },
    title: { style: { color: 'hsl(var(--foreground))' } },
    text: { style: { color: 'hsl(var(--muted-foreground))' } },
    // Subtle, borderless "AD" marker that fits the minimal aesthetic.
    label: {
      style: {
        color: 'hsl(var(--muted-foreground))',
        opacity: 0.5,
        border: 'none',
        padding: 0,
        background: 'transparent',
      },
    },
    cta: {
      style: {
        background: 'hsl(var(--primary))',
        color: 'hsl(var(--primary-foreground))',
      },
    },
  }

  return (
    <>
      <GravityReactAd
        ad={ad}
        variant={adVariant}
        className={cn(
          'relative rounded-lg',
          variant === 'featured' && 'mt-2.5',
          isCompact && 'mt-2',
          variant === 'default' && 'mt-3',
          className,
        )}
        slotProps={slotProps}
        onClick={() => trackRedditGravityAdClick('web')}
        labelText="Ad"
        openInNewTab
      />
      {showDisclaimer && (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          Promotions help keep vly affordable.
        </p>
      )}
    </>
  )
}
