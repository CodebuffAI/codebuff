'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, X } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/vly/components/ui/popover'
import { CloudFeedbackDialog } from './CloudFeedbackDialog'

const DISMISS_KEY = 'freebuff-cloud-beta-badge-dismissed'

/**
 * Compact, closable "beta" badge for the Cloud top nav bar. Replaces the old
 * full-width beta banner. Clicking the chip opens a small popover with the
 * Discord + feedback links; the trailing X dismisses it (persisted), so it
 * stops showing once closed.
 */
export function CloudBetaBadge() {
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
    <span className="inline-flex flex-shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 pl-2 pr-0.5 text-[11px] font-medium text-primary">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="leading-none transition-colors hover:text-foreground"
            aria-label="Freebuff Cloud beta info"
          >
            beta
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-60 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl shadow-black/50"
        >
          <p className="text-[13px] font-medium text-foreground">
            Freebuff Cloud is in beta
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Things may change. Report bugs and tell us what to build next.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="https://discord.gg/yXG3w7wxfs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Discord
            </Link>
            <CloudFeedbackDialog triggerClassName="inline-flex items-center gap-1.5 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" />
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss beta badge"
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-primary/20 hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
