/**
 * Per-thread agent + model picker — ONE menu for both choices, so switching
 * takes a single click. Each thread carries its own harness pick (Freebuff vs.
 * Claude Code) plus a model for that harness, so different tabs can run
 * different agents/models in parallel. Persists with the thread (see
 * /api/thread/{id}/agent); a null harness inherits the project-wide default
 * (`store.agentHarness`) so a freshly-open thread doesn't start empty.
 *
 * The menu groups models by agent: the Claude Code section lists the local
 * Claude models (core/claude-models.ts — user's subscription, no gating), the
 * Freebuff section lists the hosted models for the user's access tier with the
 * one-premium-tab soft gate (the server is the source of truth).
 *
 * Lives in the thread header bar (a pill showing agent + model), alongside the
 * project and preview controls.
 */

import { useRef, useState } from 'react'

import { CLAUDE_MODEL_OPTIONS, DEFAULT_CLAUDE_MODEL } from '../../../core/claude-models'
import { useDismissable } from '../hooks/useDismissable'
import type { AgentOption, FreebuffModelOption, HarnessId } from '../lib/types'
import { Icon } from './Icon'

export interface AgentModelPickerProps {
  /** Which harness is currently active for this tab (null = using the default).
   *  When `null`, the picker shows the project default so the trigger is never
   *  empty. */
  harnessId: HarnessId | null
  /** Fallback when no project default is known (server hasn't sent the snapshot
   *  yet, or no threads are open). First agent is used. */
  fallbackId?: HarnessId
  /** The agent catalog from the snapshot (labels + descriptions per harness). */
  agents: readonly AgentOption[]
  /** The tab's Claude model pick (null → the default, Opus 4.8). */
  claudeModel: string | null
  /** The tab's Freebuff model pick (null → falls back to the first listed). */
  freebuffModel: string | null
  /** Freebuff models the user's access tier may pick, tagged `premiumBucket`. */
  freebuffModels: readonly FreebuffModelOption[]
  /** When true, another tab holds the single premium slot, so premium-bucket
   *  Freebuff models are disabled here (only one premium tab at a time). */
  premiumLocked: boolean
  /** One pick sets both: which agent runs the tab and on which model. */
  onSelect: (harnessId: HarnessId, model: string) => void
}

export function AgentModelPicker({
  harnessId,
  fallbackId,
  agents,
  claudeModel,
  freebuffModel,
  freebuffModels,
  premiumLocked,
  onSelect,
}: AgentModelPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(open, ref, () => setOpen(false))

  if (!agents.length) return null
  const resolvedId: HarnessId = harnessId ?? fallbackId ?? agents[0].id
  const activeAgent = agents.find((o) => o.id === resolvedId) ?? agents[0]
  const activeClaude =
    CLAUDE_MODEL_OPTIONS.find((m) => m.id === claudeModel) ??
    CLAUDE_MODEL_OPTIONS.find((m) => m.id === DEFAULT_CLAUDE_MODEL) ??
    CLAUDE_MODEL_OPTIONS[0]
  const activeFreebuff = freebuffModels.find((m) => m.id === freebuffModel) ?? freebuffModels[0]
  const isClaude = resolvedId === 'claude-code'
  const triggerModel = isClaude ? activeClaude.label : activeFreebuff?.displayName

  const pick = (agent: HarnessId, model: string) => {
    onSelect(agent, model)
    setOpen(false)
  }

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
        title="Switch this thread's coding agent & model"
      >
        <span className="agent-name">{activeAgent.label}</span>
        {triggerModel && <span className="agent-model">{triggerModel}</span>}
        {!isClaude && activeFreebuff?.premiumBucket && (
          <span className="model-badge">Premium</span>
        )}
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="agent-menu" role="listbox">
          {agents.map((agent) => {
            // Hide a group with nothing to pick: the Freebuff models arrive with
            // the first state snapshot, so until then this group would render as
            // an empty header (the old ModelPicker was likewise gated on models).
            if (agent.id === 'codebuff' && freebuffModels.length === 0) return null
            return (
            <div key={agent.id} className="agent-menu-group">
              <div className="agent-menu-header">
                <span className={`agent-dot agent-dot-${agent.id}`} />
                <span className="agent-menu-title">{agent.label}</span>
                <span className="agent-menu-desc">{agent.description}</span>
              </div>
              {agent.id === 'claude-code'
                ? CLAUDE_MODEL_OPTIONS.map((m) => {
                    const selected = isClaude && m.id === activeClaude.id
                    return (
                      <button
                        key={m.id}
                        className={`agent-option ${selected ? 'active' : ''}`}
                        role="option"
                        aria-selected={selected}
                        onClick={() => pick(agent.id, m.id)}
                      >
                        <span className="agent-option-body">
                          <span className="agent-option-title">{m.label}</span>
                          <span className="agent-option-desc">{m.tagline}</span>
                        </span>
                        {selected && <Icon name="check" />}
                      </button>
                    )
                  })
                : freebuffModels.map((m) => {
                    const selected = !isClaude && m.id === activeFreebuff?.id
                    const disabled = m.premiumBucket && premiumLocked && !selected
                    return (
                      <button
                        key={m.id}
                        className={`agent-option ${selected ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                        role="option"
                        aria-selected={selected}
                        disabled={disabled}
                        title={disabled ? 'In use in another tab' : undefined}
                        onClick={() => {
                          if (disabled) return
                          pick(agent.id, m.id)
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
                        {selected && <Icon name="check" />}
                      </button>
                    )
                  })}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
