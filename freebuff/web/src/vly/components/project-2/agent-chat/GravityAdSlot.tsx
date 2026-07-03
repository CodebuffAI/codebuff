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
/** How long pinned toolbar/composer ads stay before we allow a refresh. */
const PINNED_AD_TTL_MS = 30 * 60 * 1000

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

function pinnedAdCacheKey(slotKey: string, sessionId: string) {
  return `freebuff-gravity-pinned-ad:${slotKey || sessionId}`
}

function readPinnedAdCache(key: string): GravityAd | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ad?: GravityAd; fetchedAt?: number }
    if (
      !parsed.ad ||
      typeof parsed.fetchedAt !== 'number' ||
      Date.now() - parsed.fetchedAt > PINNED_AD_TTL_MS
    ) {
      window.sessionStorage.removeItem(key)
      return null
    }
    return parsed.ad
  } catch {
    return null
  }
}

function writePinnedAdCache(key: string, ad: GravityAd) {
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
const PLACEMENT_INSIDE_INPUT_BOX = 'Web-Inside-Input-Box'

type GravityPlacement =
  | 'center'
  | 'sidebar'
  | 'above-iframe'
  | 'inside-input-box'

function getPlacementId(placement?: GravityPlacement) {
  switch (placement) {
    case 'center':
      return PLACEMENT_CENTER
    case 'sidebar':
      return PLACEMENT_SIDEBAR
    case 'above-iframe':
      return PLACEMENT_ABOVE_IFRAME
    case 'inside-input-box':
      return PLACEMENT_INSIDE_INPUT_BOX
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
  /** "featured" = larger (e.g. in chat); "compact" = smaller (sidebar); "nav" = full-width iframe chrome; "input" = inline composer row. */
  variant?: 'default' | 'featured' | 'compact' | 'nav' | 'input'
  /** Placement for Gravity: "center" | "sidebar" | "above-iframe" | "inside-input-box"; omit for chat. */
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
  const displayText =
    description || ad.cta?.trim() || ad.title?.trim() || brand
  const href = ad.clickUrl || ad.url || undefined

  if (!displayText) return null

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded-md px-2 py-0.5',
        className,
      )}
    >
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
        className="group flex min-w-0 flex-1 items-center gap-1.5 no-underline"
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
          <span className="shrink-0 text-[11px] font-semibold text-foreground/80 transition group-hover:text-foreground">
            {brand}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground transition group-hover:text-foreground/80">
          {displayText}
        </span>
      </a>
    </div>
  )
}

/**
 * Minimal composer ad. It intentionally has no container background, border,
 * or card chrome so it reads as one quiet line between the input and controls.
 */
function InputAd({ ad, className }: { ad: GravityAd; className?: string }) {
  const { containerRef, handleClick } = useAdTracking({ ad })
  const href = ad.clickUrl || ad.url || undefined
  const brand = ad.brandName?.trim() || ad.title?.trim() || 'Sponsored'
  const description = ad.adText?.trim() || ad.title?.trim() || ad.cta?.trim()

  if (!description) return null

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
        'flex min-w-0 items-center gap-1.5 px-0 py-2 text-[11px] no-underline',
        'text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      {ad.favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.favicon}
          alt=""
          loading="lazy"
          className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      <span className="shrink-0 font-medium text-foreground/70">{brand}</span>
      <span className="shrink-0 text-muted-foreground/45">AD</span>
      <span className="min-w-0 flex-1 truncate">{description}</span>
      {ad.cta ? (
        <span className="shrink-0 font-medium text-primary">{ad.cta}</span>
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
  // Toolbar (above iframe) and composer ads pin for PINNED_AD_TTL_MS: one fetch
  // per project slot, cached in sessionStorage. They ignore draft/message churn
  // and the 60s chat cooldown so inventory doesn't flicker away mid-session.
  const isPinnedSlot = variant === 'nav' || variant === 'input'
  const pinnedCacheKey = useMemo(
    () => (isPinnedSlot ? pinnedAdCacheKey(slotKey ?? '', sessionId) : ''),
    [isPinnedSlot, slotKey, sessionId],
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
            if (!mountedRef.current) return
            const next = result ?? fallbackAd ?? null
            if (next) {
              setAd(next)
            }
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

  // Pinned slots: one fetch per project slot, cached in sessionStorage for
  // PINNED_AD_TTL_MS. Ignores message edits, tab visibility, and the 60s chat
  // cooldown so toolbar/composer ads don't rotate or disappear mid-session.
  useEffect(() => {
    if (!isPinnedSlot || !pinnedCacheKey) return

    const cached = readPinnedAdCache(pinnedCacheKey)
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
        if (next) {
          setAd(next)
          writePinnedAdCache(pinnedCacheKey, next)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && mountedRef.current) setHasFetched(true)
      })

    return () => {
      cancelled = true
    }
    // Only re-pin when the project slot changes — not on message/draft churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPinnedSlot, pinnedCacheKey, sessionId, placement])

  useEffect(() => {
    if (isPinnedSlot) return

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
  }, [sessionId, placement, slotKey, stableMessagesKey, isTabVisible, isPinnedSlot])

  if (!hasFetched || !ad) return null

  if (variant === 'nav') {
    return <NavAd ad={ad} className={className} />
  }

  if (variant === 'input') {
    return <InputAd ad={ad} className={className} />
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
        padding: '18px 20px',
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
          variant === 'featured' && 'my-4',
          isCompact && 'my-3',
          variant === 'default' && 'my-5',
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
