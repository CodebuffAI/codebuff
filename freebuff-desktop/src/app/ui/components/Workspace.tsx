import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { ThreadView } from './ThreadView'
import { QueuePanel } from './QueuePanel'
import { api } from '../lib/api'

const MIN_QUEUE = 260
const MAX_QUEUE = 760
// Chat is the primary surface — at the default 1440px window this leaves the
// queue panel a bit under half the width.
const DEFAULT_QUEUE = 600
const STORAGE_KEY = 'fb.queueWidth'

function clamp(w: number): number {
  return Math.min(MAX_QUEUE, Math.max(MIN_QUEUE, w))
}

function loadWidth(): number {
  // localStorage is only a synchronous cache for same-run reloads: the
  // packaged app serves the UI from a random localhost port each launch, so
  // origin-keyed storage resets on restart. The durable copy lives server-side
  // (/api/settings/ui) and is reconciled in the effect below.
  //
  // getItem returns null when unset; Number(null) is 0 (finite), which would
  // mask DEFAULT_QUEUE and collapse a fresh profile to MIN_QUEUE. Treat a
  // missing/blank value as "no preference" so the default applies.
  const raw = localStorage.getItem(STORAGE_KEY)
  const saved = raw == null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(saved) ? clamp(saved) : DEFAULT_QUEUE
}

// Fetch the server-persisted width once per page load, not per Workspace mount
// — a remount mid-session must not stomp a width the user just dragged to.
let fetchedServerWidth = false

export function Workspace({ activeId }: { activeId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [queueWidth, setQueueWidth] = useState(loadWidth)

  useEffect(() => {
    if (fetchedServerWidth) return
    fetchedServerWidth = true
    api
      .getUiPrefs()
      .then((prefs) => {
        if (typeof prefs?.queueWidth !== 'number' || !Number.isFinite(prefs.queueWidth)) return
        const w = clamp(prefs.queueWidth)
        setQueueWidth(w)
        localStorage.setItem(STORAGE_KEY, String(w))
      })
      .catch(() => {})
  }, [])

  // During a drag we mutate the grid track via a CSS variable on the DOM node
  // directly, so the (potentially heavy) ThreadView/QueuePanel subtrees don't
  // re-render on every mousemove. React state is committed once, on mouseup.
  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const startX = e.clientX
    const startWidth = queueWidth
    let next = startWidth

    const onMove = (ev: MouseEvent) => {
      // Queue panel is on the right, so dragging the divider left widens it.
      next = clamp(startWidth - (ev.clientX - startX))
      el.style.setProperty('--queue-w', `${next}px`)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('col-resizing')
      setQueueWidth(next)
      localStorage.setItem(STORAGE_KEY, String(next))
      void api.saveUiPrefs({ queueWidth: next }).catch(() => {})
    }

    document.body.classList.add('col-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="workspace"
      style={{ '--queue-w': `${queueWidth}px` } as CSSProperties}
    >
      <ThreadView threadId={activeId} />
      <div
        className="col-divider"
        onMouseDown={onDividerDown}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
      />
      <QueuePanel threadId={activeId} />
    </div>
  )
}
