'use client'

import { gravityContext, hashPii } from '@gravity-ai/api'
import { GravityAd as GravityReactAd } from '@gravity-ai/react'
import { useSession } from 'next-auth/react'
import { memo, useEffect, useState } from 'react'
import { z } from 'zod'

import type { GravityContext } from '@gravity-ai/api'

import { trackRedditGravityAdClick } from '@/lib/reddit-funnel'

const ROTATE_INTERVAL_MS = 60_000
const FETCH_TIMEOUT_MS = 5_000
/** Auctions per cycle; the slot pauses after this many until the next send. */
const MAX_AD_FETCHES = 1

const adSchema = z.object({
  adText: z.string(),
  title: z.string().catch(''),
  cta: z.string().catch(''),
  brandName: z.string().catch(''),
  url: z.string().catch(''),
  favicon: z.string().optional().catch(undefined),
  impUrl: z.string(),
  clickUrl: z.string(),
})

type ChatAd = z.infer<typeof adSchema>

function parseAds(data: unknown): ChatAd[] {
  const parsed = z.object({ ads: z.array(z.unknown()) }).safeParse(data)
  if (!parsed.success) return []
  return parsed.data.ads.flatMap((raw) => {
    const ad = adSchema.safeParse(raw)
    return ad.success ? [ad.data] : []
  })
}

async function buildChatGravityContext(params: {
  sessionId: string
  userId?: string | null
  email?: string | null
}): Promise<GravityContext> {
  const hashedIdentity = await hashPii({ email: params.email }).catch(() => ({}))
  return gravityContext({
    sessionId: params.sessionId,
    user: {
      userId: params.userId ?? params.sessionId,
      ...hashedIdentity,
    },
  })
}

export type ChatAdSeed = {
  /** Increments per send so a repeated identical message still restarts. */
  seq: number
  content: string
}

/**
 * Rotating sponsored slot shown above the chat composer. Renders nothing
 * until the user sends a message. Each message (re)starts a rotation cycle:
 * an immediate auction targeted by that message, pausing until the next
 * message.
 */
export const ChatAds = memo(function ChatAds({
  seed,
}: {
  seed: ChatAdSeed | null
}) {
  const [sessionId] = useState(
    () =>
      globalThis.crypto?.randomUUID?.() ??
      `chat-${Math.random().toString(36).slice(2)}`,
  )
  const [ad, setAd] = useState<ChatAd | null>(null)
  const { data: session } = useSession()

  useEffect(() => {
    if (!seed) return
    let fetchCount = 0
    let controller: AbortController | null = null

    const fetchNextAd = async () => {
      fetchCount += 1
      const thisController = new AbortController()
      controller = thisController
      const timeout = setTimeout(() => thisController.abort(), FETCH_TIMEOUT_MS)

      try {
        const gravityContextPayload = await buildChatGravityContext({
          sessionId,
          userId: session?.user?.id,
          email: session?.user?.email,
        })
        const res = await fetch('/api/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: seed.content }],
            sessionId,
            gravity_context: gravityContextPayload,
            surface: 'chat_assistant',
          }),
          signal: thisController.signal,
        })
        const next = res.ok ? parseAds(await res.json())[0] : undefined
        if (next) setAd(next)
      } catch {
      } finally {
        clearTimeout(timeout)
      }
    }

    void fetchNextAd()
    if (MAX_AD_FETCHES <= 1) {
      return () => {
        controller?.abort()
      }
    }

    const interval = setInterval(() => {
      if (document.hidden) return
      if (fetchCount >= MAX_AD_FETCHES) {
        clearInterval(interval)
        return
      }
      void fetchNextAd()
    }, ROTATE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      controller?.abort()
    }
  }, [seed, sessionId, session?.user?.id, session?.user?.email])

  if (!ad) return null

  return (
    <GravityReactAd
      ad={ad}
      // `inline` (not `banner`): the library's `banner` variant only renders
      // favicon + title + CTA and omits `adText`, so the promotional body copy
      // never showed. `inline` is a horizontal row that includes `adText` and
      // matches the proven coding-agent ad slot (see GravityAdSlot's compact path).
      variant="inline"
      className="mb-2 w-full"
      onClick={() => trackRedditGravityAdClick('chat')}
      slotProps={{
        container: {
          style: {
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            color: 'hsl(var(--foreground))',
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 12,
          },
        },
        brand: { style: { color: 'hsl(var(--foreground))' } },
        title: { style: { color: 'hsl(var(--foreground))' } },
        text: { style: { color: 'hsl(var(--muted-foreground))' } },
        cta: {
          style: {
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.92)',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
          },
        },
        // Subtle, borderless marker.
        label: {
          style: {
            color: 'rgba(255,255,255,0.32)',
            border: 'none',
            padding: 0,
          },
        },
      }}
      labelText="Ad"
      openInNewTab
    />
  )
})
