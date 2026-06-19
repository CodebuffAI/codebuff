'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gravityContext, hashPii } from '@gravity-ai/api'
import { GravityAd as GravityReactAd } from '@gravity-ai/react'
import { useSession } from 'next-auth/react'

import { cn } from '@/vly/lib/utils'

import type {
  GravityContext as GravitySdkContext,
  HashedIdentity,
} from '@gravity-ai/api'
import type { AdResponse } from '@gravity-ai/react'

const AD_COOLDOWN_MS = 60_000
const AD_DEBOUNCE_MS = 2_000

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
  }, [sessionId, placement, slotKey, stableMessagesKey, isTabVisible])

  if (!hasFetched || !ad) return null

  const isNav = variant === 'nav'
  const isCompact = variant === 'compact'
  const adVariant = isNav ? 'toolbar' : isCompact ? 'inline' : 'card'
  const slotProps = isNav
    ? {
        container: {
          style: {
            width: '100%',
            minWidth: 0,
            padding: '4px 6px',
            gap: 8,
            background: 'transparent',
            color: 'inherit',
            boxShadow: 'none',
            borderRadius: 6,
          },
        },
        brand: { style: { color: 'currentColor', fontSize: 11 } },
        title: {
          style: {
            color: 'rgba(255,255,255,0.62)',
            fontSize: 11,
            marginLeft: 6,
          },
        },
        cta: {
          style: {
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            borderRadius: 6,
            padding: '5px 9px',
            fontSize: 10,
          },
        },
        label: { style: { color: 'rgba(255,255,255,0.28)' } },
      }
    : {
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
          isNav ? 'flex min-w-0' : 'relative rounded-lg',
          variant === 'featured' && 'mt-2.5',
          isCompact && 'mt-2',
          variant === 'default' && 'mt-3',
          className,
        )}
        slotProps={slotProps}
        labelText="AD"
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
