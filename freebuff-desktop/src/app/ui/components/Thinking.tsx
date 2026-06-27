import { memo, useEffect, useRef } from 'react'

import type { ReasoningCollapse } from '../lib/types'

interface ThinkingProps {
  text: string
  collapse: ReasoningCollapse
  /** True once reasoning has finished streaming (drives the pulsing dot). */
  complete: boolean
  onToggle: () => void
}

/**
 * Streaming "Thinking" block — mirrors the CLI (cli/src/components/thinking.tsx):
 * a `preview` shows a short tail window of the latest reasoning (auto-scrolled to
 * the bottom so new tokens stay in view), `expanded` shows it all, `hidden` shows
 * just the header. Clicking the header toggles; a new user message auto-collapses
 * it to `hidden` (see the store's autoCollapseReasoning).
 */
export const Thinking = memo(function Thinking({ text, collapse, complete, onToggle }: ThinkingProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  // Keep the preview window pinned to the newest tokens as it streams. Only the
  // preview clamps height, so skip the reflow when expanded/hidden.
  useEffect(() => {
    if (collapse !== 'preview') return
    const el = previewRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text, collapse])

  const indicator = !complete ? '•' : collapse === 'expanded' ? '▾' : '▸'

  return (
    <div className={`reasoning ${collapse}`}>
      <button className="reasoning-head" onClick={onToggle}>
        <span className={`reasoning-dot ${complete ? '' : 'pulse'}`} aria-hidden>
          {indicator}
        </span>
        <span className="reasoning-label">{complete ? 'Thinking' : 'Thinking…'}</span>
      </button>
      {collapse !== 'hidden' && text && (
        <div className={`reasoning-${collapse}`} ref={collapse === 'preview' ? previewRef : undefined}>
          <div className="reasoning-text">{text}</div>
        </div>
      )}
    </div>
  )
})
