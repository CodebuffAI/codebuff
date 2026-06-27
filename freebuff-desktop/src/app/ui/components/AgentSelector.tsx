/**
 * App-wide agent picker (lives in the title bar). Switches which harness runs
 * thread turns: the free hosted Codebuff agent, or the user's local, authenticated
 * Claude Code (Opus 4.8). The choice is global and persists across restarts (see
 * the server's /api/settings/agent + project-dir state).
 */

import { useEffect, useRef, useState } from 'react'

import { useStore } from '../store/store'
import { Icon } from './Icon'

export function AgentSelector() {
  const harnessId = useStore((s) => s.agentHarness)
  const options = useStore((s) => s.agentOptions)
  const setAgentHarness = useStore((s) => s.setAgentHarness)
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
  const active = options.find((o) => o.id === harnessId) ?? options[0]

  return (
    <div className="agent-selector" ref={ref}>
      <button
        className="agent-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Switch the coding agent"
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
              className={`agent-option ${o.id === active.id ? 'active' : ''}`}
              role="option"
              aria-selected={o.id === active.id}
              onClick={() => {
                setAgentHarness(o.id)
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
              {o.id === active.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
