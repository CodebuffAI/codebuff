import { useRef, useState, type CSSProperties } from 'react'

import { ThreadView } from './ThreadView'
import { QueuePanel } from './QueuePanel'

const MIN_QUEUE = 260
const MAX_QUEUE = 760
const DEFAULT_QUEUE = 720
const STORAGE_KEY = 'fb.queueWidth'

function clamp(w: number): number {
  return Math.min(MAX_QUEUE, Math.max(MIN_QUEUE, w))
}

function loadWidth(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(saved) ? clamp(saved) : DEFAULT_QUEUE
}

export function Workspace({ activeId }: { activeId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [queueWidth, setQueueWidth] = useState(loadWidth)

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
