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
import { CODEX_MODEL_OPTIONS, DEFAULT_CODEX_MODEL } from '../../../core/codex-models'
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
  /** The tab's Codex model pick (null → the default, GPT-5.5 Codex). */
  codexModel: string | null
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

/** The freebuff model option a tab's pick resolves to: the explicit pick when
 *  it's in the tier's list, else the first listed model. THE single definition
 *  of "which model is this tab on" for display — the picker trigger, the
 *  locked label, and the header quota badge all resolve through this so they
 *  can never disagree about the model they describe. */
export function activeFreebuffModelOption(
  models: readonly FreebuffModelOption[],
  pick: string | null,
): FreebuffModelOption | undefined {
  return models.find((m) => m.id === pick) ?? models[0]
}

/** What a tab's (harness, model) picks resolve to for display: agent label +
 *  model label (+ premium flag). Shared by the picker trigger and the static
 *  header label a started thread shows. */
/** The Claude model option a tab's pick resolves to (explicit pick → default →
 *  first). Mirrors {@link activeFreebuffModelOption} for the local Claude catalog. */
export function activeClaudeModelOption(pick: string | null) {
  return (
    CLAUDE_MODEL_OPTIONS.find((m) => m.id === pick) ??
    CLAUDE_MODEL_OPTIONS.find((m) => m.id === DEFAULT_CLAUDE_MODEL) ??
    CLAUDE_MODEL_OPTIONS[0]
  )
}

/** The Codex model option a tab's pick resolves to (explicit pick → default →
 *  first). */
export function activeCodexModelOption(pick: string | null) {
  return (
    CODEX_MODEL_OPTIONS.find((m) => m.id === pick) ??
    CODEX_MODEL_OPTIONS.find((m) => m.id === DEFAULT_CODEX_MODEL) ??
    CODEX_MODEL_OPTIONS[0]
  )
}

export function resolveAgentModel(sel: {
  harnessId: HarnessId | null
  fallbackId?: HarnessId
  agents: readonly AgentOption[]
  claudeModel: string | null
  codexModel: string | null
  freebuffModel: string | null
  freebuffModels: readonly FreebuffModelOption[]
}): {
  agent: AgentOption
  isClaude: boolean
  isCodex: boolean
  modelLabel?: string
  premium: boolean
} | null {
  const { agents, freebuffModels } = sel
  if (!agents.length) return null
  const resolvedId: HarnessId = sel.harnessId ?? sel.fallbackId ?? agents[0].id
  const agent = agents.find((o) => o.id === resolvedId) ?? agents[0]
  const activeClaude = activeClaudeModelOption(sel.claudeModel)
  const activeCodex = activeCodexModelOption(sel.codexModel)
  const activeFreebuff = activeFreebuffModelOption(freebuffModels, sel.freebuffModel)
  const isClaude = resolvedId === 'claude-code'
  const isCodex = resolvedId === 'codex'
  return {
    agent,
    isClaude,
    isCodex,
    modelLabel: isClaude
      ? activeClaude.label
      : isCodex
        ? activeCodex.label
        : activeFreebuff?.displayName,
    premium: !isClaude && !isCodex && !!activeFreebuff?.premiumBucket,
  }
}

/** Read-only agent + model chip for a STARTED thread — same content as the
 *  picker trigger, but a plain label: the pick is locked once a thread starts
 *  (a different agent/model means a new tab). */
export function AgentModelLabel(props: {
  harnessId: HarnessId | null
  fallbackId?: HarnessId
  agents: readonly AgentOption[]
  claudeModel: string | null
  codexModel: string | null
  freebuffModel: string | null
  freebuffModels: readonly FreebuffModelOption[]
}) {
  const active = resolveAgentModel(props)
  if (!active) return null
  return (
    <span
      className="agent-label"
      title="This thread's agent & model are locked — open a new tab to use a different one"
    >
      <span className="agent-name">{active.agent.label}</span>
      {active.modelLabel && <span className="agent-model">{active.modelLabel}</span>}
      {active.premium && <span className="model-badge">Premium</span>}
    </span>
  )
}

export function AgentModelPicker({
  harnessId,
  fallbackId,
  agents,
  claudeModel,
  codexModel,
  freebuffModel,
  freebuffModels,
  premiumLocked,
  onSelect,
}: AgentModelPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(open, ref, () => setOpen(false))

  const active = resolveAgentModel({
    harnessId,
    fallbackId,
    agents,
    claudeModel,
    codexModel,
    freebuffModel,
    freebuffModels,
  })
  if (!active) return null
  const { agent: activeAgent, isClaude, isCodex } = active
  const activeClaude = activeClaudeModelOption(claudeModel)
  const activeCodex = activeCodexModelOption(codexModel)
  const activeFreebuff = activeFreebuffModelOption(freebuffModels, freebuffModel)
  const triggerModel = active.modelLabel

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
        {!isClaude && !isCodex && activeFreebuff?.premiumBucket && (
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
            // Claude Code and Codex are local-CLI agents sharing a {id,label,tagline}
            // catalog; Freebuff renders the tier's hosted models instead.
            const localCatalog =
              agent.id === 'claude-code'
                ? CLAUDE_MODEL_OPTIONS
                : agent.id === 'codex'
                  ? CODEX_MODEL_OPTIONS
                  : null
            const localActiveId = agent.id === 'codex' ? activeCodex.id : activeClaude.id
            const onLocalAgent = agent.id === 'codex' ? isCodex : isClaude
            return (
            <div key={agent.id} className="agent-menu-group">
              <div className="agent-menu-header">
                <span className={`agent-dot agent-dot-${agent.id}`} />
                <span className="agent-menu-title">{agent.label}</span>
                <span className="agent-menu-desc">{agent.description}</span>
              </div>
              {localCatalog
                ? localCatalog.map((m) => {
                    const selected = onLocalAgent && m.id === localActiveId
                    // A local agent whose CLI is unavailable (e.g. Codex not
                    // installed) comes back `disabled` in the snapshot.
                    const disabled = !!agent.disabled && !selected
                    return (
                      <button
                        key={m.id}
                        className={`agent-option ${selected ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                        role="option"
                        aria-selected={selected}
                        disabled={disabled}
                        title={disabled ? agent.disabledReason : undefined}
                        onClick={() => {
                          if (disabled) return
                          pick(agent.id, m.id)
                        }}
                      >
                        <span className="agent-option-body">
                          <span className="agent-option-title">
                            {m.label}
                            {disabled && <span className="model-badge muted">Not installed</span>}
                          </span>
                          <span className="agent-option-desc">
                            {disabled ? agent.disabledReason : m.tagline}
                          </span>
                        </span>
                        {selected && <Icon name="check" />}
                      </button>
                    )
                  })
                : freebuffModels.map((m) => {
                    const selected = !isClaude && m.id === activeFreebuff?.id
                    // slotBound (tier-aware) drives the lock: on the limited
                    // tier every model is slot-bound, so a second tab sees all
                    // options locked while another tab holds the slot.
                    const disabled = m.slotBound && premiumLocked && !selected
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
