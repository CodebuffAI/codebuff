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

import { useRef, useState } from 'react'

import { useDismissable } from '../hooks/useDismissable'
import type { AgentOption, FreebuffModelOption, HarnessId } from '../lib/types'
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
  useDismissable(open, ref, () => setOpen(false))

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
        <span className="agent-name">{active.label}</span>
        {active.modelLabel && <span className="agent-model">{active.modelLabel}</span>}
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
                  {o.label}
                  {o.modelLabel && (
                    <span className="agent-option-model"> · {o.modelLabel}</span>
                  )}
                </span>
              </span>
              {o.id === resolvedId && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface ModelPickerProps {
  /** The tab's current Freebuff model (null → falls back to the first listed). */
  model: string | null
  /** Models the user's access tier may pick, tagged with `premiumBucket`. */
  models: readonly FreebuffModelOption[]
  /** When true, another tab holds the single premium slot, so premium-bucket
   *  models are disabled here (only one premium tab at a time). */
  premiumLocked: boolean
  onChange: (model: string) => void
}

/**
 * Per-thread Freebuff model picker. Shown only for the Freebuff (hosted) agent.
 * Premium-bucket models (premium models + MiniMax M3) are disabled when another
 * tab already holds the single premium slot — the soft side of the one-premium
 * rule (the server is the source of truth).
 */
export function ModelPicker({ model, models, premiumLocked, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(open, ref, () => setOpen(false))

  if (!models.length) return null
  const active = models.find((m) => m.id === model) ?? models[0]

  return (
    <div className="agent-selector" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className="agent-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Switch this thread's Freebuff model"
      >
        <span className="agent-model">{active.displayName}</span>
        {active.premiumBucket && <span className="model-badge">Premium</span>}
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="agent-menu" role="listbox">
          {models.map((m) => {
            const disabled = m.premiumBucket && premiumLocked && m.id !== active.id
            return (
              <button
                key={m.id}
                className={`agent-option ${m.id === active.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                role="option"
                aria-selected={m.id === active.id}
                disabled={disabled}
                title={disabled ? 'In use in another tab' : undefined}
                onClick={() => {
                  if (disabled) return
                  onChange(m.id)
                  setOpen(false)
                }}
              >
                <span className="agent-option-body">
                  <span className="agent-option-title">
                    {m.displayName}
                    {m.premiumBucket && <span className="model-badge">Premium</span>}
                    {disabled && <span className="model-badge muted">In use</span>}
                  </span>
                  <span className="agent-option-desc">
                    {m.tagline}
                    {m.warning ? ` · ${m.warning}` : ''}
                  </span>
                </span>
                {m.id === active.id && <Icon name="check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
