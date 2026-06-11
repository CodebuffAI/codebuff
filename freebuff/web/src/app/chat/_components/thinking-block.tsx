'use client'

import { ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ThinkingBlock } from '@/app/chat/blocks'

import { cn } from '@/lib/utils'

// Preview height ≈ 5 lines at leading-5 (mirrors the CLI's 5-line preview).
const PREVIEW_MAX_HEIGHT = 'max-h-[6.25rem]'

/**
 * A run of reasoning tokens, mirroring the CLI's Thinking row: while
 * streaming (or while this is the latest assistant turn) it shows the tail
 * of the thinking clipped to a few lines; clicking toggles the full text.
 * Once a newer message exists (`autoPreview` flips off) it collapses to
 * just the header.
 */
export function ThinkingRow(props: {
  block: ThinkingBlock
  /** Show the tail preview by default (this is the latest assistant turn). */
  autoPreview: boolean
}) {
  const { block, autoPreview } = props
  const running = block.status === 'running'
  // null = follow the default for this turn; true/false = user override.
  const [expanded, setExpanded] = useState<boolean | null>(null)

  // A newer message arrived: drop any override so the row collapses.
  useEffect(() => {
    if (!autoPreview) setExpanded(null)
  }, [autoPreview])

  const showFull = expanded === true
  const showPreview =
    !showFull && expanded !== false && (running || autoPreview)

  const text = block.text.trim()
  if (!text) return null

  return (
    <div className="text-[13px] leading-5 text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded(!showFull)}
        aria-expanded={showFull}
        className="flex items-center gap-1.5 rounded text-muted-foreground/90 hover:text-foreground transition-colors"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform',
              showFull && 'rotate-90',
            )}
          />
        )}
        <span className={cn('font-medium', running && 'animate-pulse')}>
          {running ? 'Thinking…' : 'Thought'}
        </span>
      </button>
      {(showFull || showPreview) && (
        <div
          className={cn(
            'mt-1 overflow-hidden pl-5 italic text-muted-foreground/70',
            // Bottom-anchored clip: as tokens stream in, the newest lines
            // stay visible and older ones scroll out of the top.
            !showFull && cn('flex flex-col justify-end', PREVIEW_MAX_HEIGHT),
          )}
        >
          <div className="whitespace-pre-wrap break-words">{text}</div>
        </div>
      )}
    </div>
  )
}
