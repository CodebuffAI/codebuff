'use client'

import { ExternalLink } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { recordAdEvent } from '@/lib/record-ad-event'

const ROTATE_INTERVAL_MS = 60_000
const FETCH_TIMEOUT_MS = 5_000
/** Auctions per cycle; the slot pauses after this many until the next send. */
const MAX_AD_FETCHES = 3

const adSchema = z.object({
  adText: z.string(),
  title: z.string().catch(''),
  cta: z.string().catch(''),
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

/** Browser-side context Gravity uses for targeting; the server fills in the
 * trusted user identity itself. */
function buildGravityContext(sessionId: string) {
  return {
    sessionId,
    device: {
      ...(typeof screen !== 'undefined'
        ? { screenWidth: screen.width, screenHeight: screen.height }
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

export type ChatAdSeed = {
  /** Increments per send so a repeated identical message still restarts. */
  seq: number
  content: string
}

/**
 * Rotating sponsored slot shown above the chat composer. Renders nothing
 * until the user sends a message. Each message (re)starts a rotation cycle:
 * an immediate auction targeted by that message, then one re-auction of the
 * same placement per minute, pausing after MAX_AD_FETCHES ads until the next
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
  // Impressions already reported, so a repeated ad doesn't double-report.
  // (The server dedupes too; this just avoids redundant requests.)
  const reportedImpUrls = useRef(new Set<string>())
  const [faviconErrors, setFaviconErrors] = useState<Record<string, boolean>>(
    {},
  )

  useEffect(() => {
    if (!seed) return
    let fetchCount = 0
    let controller: AbortController | null = null

    const fetchNextAd = () => {
      fetchCount += 1
      const thisController = new AbortController()
      controller = thisController
      const timeout = setTimeout(() => thisController.abort(), FETCH_TIMEOUT_MS)

      fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: seed.content }],
          sessionId,
          gravity_context: buildGravityContext(sessionId),
          surface: 'chat_assistant',
        }),
        signal: thisController.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const next = data ? parseAds(data)[0] : undefined
          // Keep the current ad on a no-fill so the slot never goes blank.
          if (next) setAd(next)
        })
        // Unmount/timeout aborts reject the chain before the setter runs.
        .catch(() => {})
        .finally(() => clearTimeout(timeout))
    }

    fetchNextAd()
    const interval = setInterval(() => {
      // Don't burn auctions while the tab is hidden.
      if (document.hidden) return
      if (fetchCount >= MAX_AD_FETCHES) {
        clearInterval(interval)
        return
      }
      fetchNextAd()
    }, ROTATE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      controller?.abort()
    }
    // A new seed object arrives on every send, so the cleanup tears down the
    // running cycle and a fresh one starts with the latest message.
  }, [seed, sessionId])

  useEffect(() => {
    if (!ad || reportedImpUrls.current.has(ad.impUrl)) return
    reportedImpUrls.current.add(ad.impUrl)
    recordAdEvent('impression', ad.impUrl, 'chat')
  }, [ad])

  if (!ad) return null

  let hostname = ''
  try {
    hostname = new URL(ad.url).hostname.replace(/^www\./, '')
  } catch {}

  return (
    <div className="mb-2">
      <a
        key={ad.clickUrl}
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => recordAdEvent('click', ad.impUrl, 'chat')}
        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 text-xs font-medium text-muted-foreground">
          {ad.favicon && !faviconErrors[ad.favicon] ? (
            <img
              src={ad.favicon}
              alt=""
              className="h-full w-full object-cover"
              onError={() =>
                setFaviconErrors((prev) => ({ ...prev, [ad.favicon!]: true }))
              }
            />
          ) : (
            (ad.title || hostname).charAt(0).toUpperCase() || 'Ad'
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/90">
              {ad.title || hostname}
            </span>
            {ad.adText && <> — {ad.adText}</>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {ad.cta || 'Learn more'}
            <ExternalLink className="h-3 w-3" />
          </span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">
            Ad
            {hostname && <span className="normal-case">{hostname}</span>}
          </span>
        </span>
      </a>
    </div>
  )
})
