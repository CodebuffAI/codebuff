import { memo } from 'react'

/** Three bouncing dots — the placeholder shown in the assistant message slot
 *  before the agent starts streaming any text/reasoning/tool calls. Mirrors the
 *  inline feel of the CLI "thinking…" ellipsis but with movement so the bubble
 *  doesn't read as static/dead while the request is in flight. */
export const LoadingDots = memo(function LoadingDots() {
  return (
    <div className="loading-dots" role="status" aria-label="Agent is thinking">
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
    </div>
  )
})
