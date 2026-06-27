'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cloud, MessageCircle, X } from 'lucide-react'
import { CloudFeedbackDialog } from './CloudFeedbackDialog'

const DISMISS_KEY = 'freebuff-cloud-beta-banner-dismissed'

/**
 * Compact, single-line "Freebuff Cloud beta" notice. Cursor-skinned: a thin
 * info bar with a leading dot, inline links, and a dismiss (X) button that
 * persists so it stops showing once closed. The `compact` variant is the
 * workspace top-strip; the non-compact variant is the card used on the
 * Cloud home page.
 */
export function CloudBetaBanner({ compact = false }: { compact?: boolean }) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (dismissed) return null

  return (
    <div
      className={`flex w-full items-center gap-2 border-b border-border bg-[#202020] text-[13px] text-foreground/70 ${
        compact ? 'h-9 px-3' : 'rounded-md border px-3 py-2'
      }`}
    >
      <Cloud className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
      <div className="min-w-0 flex-1 truncate leading-none">
        <span className="font-medium text-foreground/90">
          Freebuff Cloud beta
        </span>
        <span className="mx-1.5 text-border">·</span>
        <span className="text-foreground/55">Report bugs in </span>
        <Link
          href="https://discord.gg/yXG3w7wxfs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:text-foreground"
        >
          Discord
          <MessageCircle className="h-3 w-3" />
        </Link>
        <span className="text-foreground/55"> or </span>
        <CloudFeedbackDialog triggerClassName="inline font-medium text-primary hover:text-foreground" />
        <span className="text-foreground/55">.</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss beta notice"
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
