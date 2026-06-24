'use client'

import { ArrowRight } from 'lucide-react'

import type { SuggestedFollowup } from '@/app/chat/blocks'

import { cn } from '@/lib/utils'

// Hover highlights a followup with the CLI's acid-green "primary" (#9EFC62) so
// the two surfaces feel like one product. It's hardcoded in the Tailwind
// arbitrary-value classes below (Tailwind can't read a JS constant).

/**
 * Clickable followup prompts shown under the latest assistant turn, mirroring
 * the CLI's suggest_followups UI: a short label per row with the full prompt
 * revealed inline (same line, truncated) on hover, plus the acid-green accent.
 * Clicking a row sends its full prompt as the next user message.
 */
export function SuggestedFollowups(props: {
  followups: SuggestedFollowup[]
  onSend: (prompt: string) => void
}) {
  if (props.followups.length === 0) return null
  // Reserve a shared label column so the revealed prompts line up across rows,
  // like the CLI's fixed-width label column.
  const labelCh = Math.min(
    34,
    Math.max(
      ...props.followups.map((f) => (f.label?.trim() || f.prompt).length),
    ),
  )
  return (
    <div className="mt-1.5">
      <p className="mb-0.5 px-1 text-[12px] font-medium text-muted-foreground/60">
        Suggested follow-ups
      </p>
      <div>
        {props.followups.map((followup, i) => (
          <FollowupRow
            key={i}
            followup={followup}
            onSend={props.onSend}
            labelCh={labelCh}
          />
        ))}
      </div>
    </div>
  )
}

function FollowupRow(props: {
  followup: SuggestedFollowup
  onSend: (prompt: string) => void
  labelCh: number
}) {
  const { prompt, label } = props.followup
  const trimmedLabel = label?.trim()
  const title = trimmedLabel || prompt
  // Reveal the full prompt inline only when the label is a shorter stand-in.
  const detail = trimmedLabel && trimmedLabel !== prompt ? prompt : null

  return (
    <button
      type="button"
      onClick={() => props.onSend(prompt)}
      className="group/sf flex w-full items-center gap-2 overflow-hidden rounded-md px-1 py-1 text-left transition-colors hover:bg-[#9EFC62]/[0.07]"
    >
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/sf:text-[#9EFC62]" />
      <span
        className={cn(
          'truncate text-[13.5px] leading-5 text-foreground/90 transition-colors group-hover/sf:text-[#9EFC62]',
          detail ? 'shrink-0' : 'min-w-0 flex-1',
        )}
        style={detail ? { minWidth: `${props.labelCh}ch` } : undefined}
      >
        {title}
      </span>
      {detail && (
        // Always present (so the row height never changes) but only visible on
        // hover; single line, truncated to the remaining width.
        <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/sf:opacity-100">
          {detail}
        </span>
      )}
    </button>
  )
}
