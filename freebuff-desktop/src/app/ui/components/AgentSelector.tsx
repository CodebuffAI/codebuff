/**
 * Per-thread agent picker. Each thread carries its own harness pick (Codebuff
 * vs. Claude Code), so different threads can run on different agents in parallel.
 * Persists with the thread (see /api/thread/{id}/harness); a null pick
 * inherits the project-wide default (`store.agentHarness`) so a freshly-open
 * thread doesn't start empty.
 *
 * Lives in the thread header bar (a full pill showing the agent name + model),
 * alongside the project and preview controls.
 */

import { useEffect, useRef, useState } from 'react'

import type { AgentOption, HarnessId } from '../lib/types'
import { Icon } from './Icon'

export interface AgentPickerProps {
  /** Which harness is currently active for this tab (null = using the default).
   *  When `null`, the picker shows the project default so the trigger is never
   *  empty. The popover's `active.id` reflects this resolved value. */
  harnessId: HarnessId | null
  /** The full option catalog. Tab-level defaulting can read this to resolve
   *  `null` into a real id without an extra store call. */
  options: readonly AgentOption[]
  /** Fallback when no project default is known (server hasn't sent the snapshot
   *  yet, or no threads are open). First option is used. */
  fallbackId?: HarnessId
  onChange: (harnessId: HarnessId) => void
}

export function AgentPicker({
  harnessId,
  options,
  fallbackId,
  onChange,
}: AgentPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!options.length) return null
  const resolvedId: HarnessId = harnessId ?? fallbackId ?? options[0].id
  const active = options.find((o) => o.id === resolvedId) ?? options[0]

  return (
    <div
      className="agent-selector"
      ref={ref}
      // Stop propagation so a click on the picker doesn't bubble up to header
      // controls behind it.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="agent-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Switch this thread's coding agent"
      >
        <span className={`agent-dot agent-dot-${active.id}`} />
        <span className="agent-name">{active.label}</span>
        <span className="agent-model">{active.modelLabel}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="agent-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.id}
              className={`agent-option ${o.id === resolvedId ? 'active' : ''}`}
              role="option"
              aria-selected={o.id === resolvedId}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
            >
              <span className={`agent-dot agent-dot-${o.id}`} />
              <span className="agent-option-body">
                <span className="agent-option-title">
                  {o.label} <span className="agent-option-model">· {o.modelLabel}</span>
                </span>
                <span className="agent-option-desc">{o.description}</span>
              </span>
              {o.id === resolvedId && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
