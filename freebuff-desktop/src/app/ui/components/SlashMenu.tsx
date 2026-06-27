import { useEffect, useRef } from 'react'

import type { Command } from '../lib/commands'

/** Popover listing slash-command matches above the composer. Purely presentational —
 *  selection/keyboard state lives in the Composer. */
export function SlashMenu({
  commands,
  selected,
  onSelect,
  onHover,
}: {
  commands: Command[]
  selected: number
  onSelect: (c: Command) => void
  onHover: (i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Keep the highlighted row in view as the user arrows through a long list.
  useEffect(() => {
    ref.current?.querySelector('.slash-item.sel')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (commands.length === 0) return null
  return (
    <div className="slash-menu" ref={ref}>
      {commands.map((c, i) => (
        <button
          key={`${c.kind}:${c.name}`}
          className={`slash-item ${i === selected ? 'sel' : ''}`}
          // onMouseDown (not onClick) fires before the textarea blur, so the
          // command runs without the composer losing focus first.
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(c)
          }}
          onMouseMove={() => onHover(i)}
        >
          <span className="slash-name">/{c.name}</span>
          <span className="slash-hint">{c.hint}</span>
          {c.kind === 'skill' && <span className="slash-tag">skill</span>}
        </button>
      ))}
    </div>
  )
}
