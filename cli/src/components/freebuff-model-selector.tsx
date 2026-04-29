import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_GLM_MODEL_ID,
  FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  isFreebuffModelAvailable,
} from '@codebuff/common/constants/freebuff-models'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  nextSelectableFreebuffModelId,
  resolveFreebuffModelCommitTarget,
} from '../utils/freebuff-model-navigation'

import type { KeyEvent } from '@opentui/core'

const FREEBUFF_MODEL_SELECTOR_MODELS = [
  ...FREEBUFF_MODELS.filter(
    (model) => model.id === FREEBUFF_GEMINI_PRO_MODEL_ID,
  ),
  ...FREEBUFF_MODELS.filter((model) => model.id === FREEBUFF_GLM_MODEL_ID),
  ...FREEBUFF_MODELS.filter(
    (model) =>
      model.id !== FREEBUFF_GEMINI_PRO_MODEL_ID &&
      model.id !== FREEBUFF_GLM_MODEL_ID,
  ),
]

/**
 * Dual-purpose model picker:
 *   - Pre-chat landing (session 'none'): user hasn't joined any queue. Picking
 *     a model is their explicit commitment to enter — this triggers the POST.
 *   - In-queue switcher (session 'queued'): picking a *different* model moves
 *     the user to the back of that queue (lose place in original). Picking the
 *     model they're already in is a no-op.
 *
 * To prevent accidental queue loss while queued, keyboard navigation is
 * two-step: Tab / arrow keys move a focus highlight, and Enter commits the
 * switch. Mouse clicks are still one-step. On the landing screen, pressing
 * Enter on the already-focused model also commits — there's nothing to lose.
 *
 * Each row shows a live "N ahead" count sourced from the server's
 * `queueDepthByModel` snapshot so the choice is informed.
 */
export const FreebuffModelSelector: React.FC = () => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const setSelectedModel = useFreebuffModelStore((s) => s.setSelectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
  const now = useNow(60_000)
  const deploymentAvailabilityLabel = useMemo(
    () => getFreebuffDeploymentAvailabilityLabel(new Date(now)),
    [now],
  )
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Keyboard cursor — separate from the actually-selected model so that
  // Tab/arrow navigation can preview without committing. Re-syncs to the
  // selected model whenever the selection changes (after a successful switch
  // or an external selectedModel update).
  const [focusedId, setFocusedId] = useState<string>(selectedModel)
  useEffect(() => {
    setFocusedId(selectedModel)
  }, [selectedModel])

  useEffect(() => {
    // Landing-screen safety net: if the in-memory selection becomes
    // unavailable (e.g. deployment hours close while the picker is open),
    // swap to the always-available fallback so Enter doesn't POST a model
    // the server will immediately reject. In-memory only — the user's saved
    // preference (e.g. GLM) is preserved for the next launch.
    if (
      (session?.status === 'none' || !session) &&
      !isFreebuffModelAvailable(selectedModel, new Date(now))
    ) {
      setSelectedModel(FALLBACK_FREEBUFF_MODEL_ID)
    }
  }, [now, selectedModel, session, setSelectedModel])

  // Landing ('none'): depths come from the server snapshot, no "self" to
  // subtract. In-queue ('queued'): for the user's queue, "ahead" is
  // `position - 1` (themselves don't count); for every other queue, switching
  // would land them at the back, so it's that queue's full depth. Null before
  // any snapshot so the UI doesn't flash misleading zeros — in particular,
  // landing mode after a session ends initially sets status='none' with no
  // queueDepthByModel; returning null here keeps the hint blank until the
  // fetch lands, instead of showing "No wait" on every row.
  const aheadByModel = useMemo<Record<string, number> | null>(() => {
    if (session?.status === 'none') {
      if (!session.queueDepthByModel) return null
      const depths = session.queueDepthByModel
      const out: Record<string, number> = {}
      for (const { id } of FREEBUFF_MODELS) out[id] = depths[id] ?? 0
      return out
    }
    if (session?.status === 'queued') {
      const depths = session.queueDepthByModel ?? {}
      const out: Record<string, number> = {}
      for (const { id } of FREEBUFF_MODELS) {
        out[id] =
          id === session.model
            ? Math.max(0, session.position - 1)
            : (depths[id] ?? 0)
      }
      return out
    }
    return null
  }, [session])

  // Pad the trailing hint ("3 ahead", "No wait", "…") to a fixed width so
  // buttons don't visibly resize when the queue depth ticks down (12 → 9) or
  // when the user's selection moves between queues. The tagline is shown
  // inline with the name now, so it's no longer part of this slot.
  const hintWidth = useMemo(
    () => Math.max('No wait'.length, '999 ahead'.length),
    [],
  )

  // Decide row vs column layout based on whether both buttons actually fit
  // side-by-side. Each button's inner text is
  // "● {displayName} · {tagline} · {hours}  {hint}",
  // plus 2 cols of border and 2 cols of padding. Buttons are separated by a
  // gap of 2. If the total exceeds the terminal width, stack vertically.
  const stackVertically = useMemo(() => {
    const BUTTON_CHROME = 4 // 2 border + 2 padding
    const GAP = 2
    const total = FREEBUFF_MODEL_SELECTOR_MODELS.reduce((sum, model, idx) => {
      const inner =
        2 /* indicator + space */ +
        model.displayName.length +
        3 /* " · " */ +
        model.tagline.length +
        (model.availability === 'deployment_hours'
          ? 3 + deploymentAvailabilityLabel.length
          : 0) +
        2 /* "  " */ +
        hintWidth
      return sum + inner + BUTTON_CHROME + (idx > 0 ? GAP : 0)
    }, 0)
    // Leave a small margin for the surrounding padding on the waiting-room screen.
    return total > terminalWidth - 4
  }, [deploymentAvailabilityLabel, hintWidth, terminalWidth])

  // "Already committed to this model" — only when the server has us queued
  // on it. On the landing screen (status 'none'), nothing is committed yet,
  // so picking the focused model is always a real action (first join).
  const committedModelId = session?.status === 'queued' ? session.model : null

  const pick = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === committedModelId) return
      if (!isFreebuffModelAvailable(modelId, new Date(now))) return
      setPending(modelId)
      joinFreebuffQueue(modelId).finally(() => setPending(null))
    },
    [pending, committedModelId, now],
  )

  // Tab / Shift+Tab and arrow keys move the focus highlight only; Enter or
  // Space commits the switch. Two-step navigation prevents the user from
  // accidentally giving up their place in line by tabbing past their queue.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        const isForward =
          name === 'right' || name === 'down' || (name === 'tab' && !key.shift)
        const isBackward =
          name === 'left' || name === 'up' || (name === 'tab' && key.shift)
        const isCommit =
          name === 'return' || name === 'enter' || name === 'space'
        if (!isForward && !isBackward && !isCommit) return
        if (isCommit) {
          const targetId = resolveFreebuffModelCommitTarget({
            focusedId,
            selectedId: selectedModel,
            committedId: committedModelId,
            isSelectable: (modelId) =>
              isFreebuffModelAvailable(modelId, new Date(now)),
          })
          if (targetId) {
            key.preventDefault?.()
            pick(targetId)
          }
          return
        }
        const targetId = nextSelectableFreebuffModelId({
          modelIds: FREEBUFF_MODEL_SELECTOR_MODELS.map((model) => model.id),
          focusedId,
          direction: isForward ? 'forward' : 'backward',
          isSelectable: (modelId) =>
            isFreebuffModelAvailable(modelId, new Date(now)),
        })
        if (targetId) {
          key.preventDefault?.()
          setFocusedId(targetId)
        }
      },
      [pending, pick, focusedId, selectedModel, committedModelId, now],
    ),
  )

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
      }}
    >
      <box
        style={{
          flexDirection: stackVertically ? 'column' : 'row',
          gap: stackVertically ? 0 : 2,
          alignItems: 'flex-start',
        }}
      >
        {FREEBUFF_MODEL_SELECTOR_MODELS.map((model) => {
          // 'Selected' means the dot is filled and the label is bold. On the
          // landing screen ('none') this tracks the pre-focused pick; on the
          // queued screen it tracks the model the server has us on. Either
          // way, selectedModel is the safe fallback if focus ever lands on a
          // closed row (for example when deployment hours change).
          const isSelected = model.id === selectedModel
          const isHovered = hoveredId === model.id
          const isFocused = focusedId === model.id && !isSelected
          const isAvailable = isFreebuffModelAvailable(model.id, new Date(now))
          const indicator = isSelected ? '●' : '○'
          const indicatorColor = isSelected ? theme.primary : theme.muted
          const labelColor =
            isSelected && isAvailable ? theme.foreground : theme.muted
          // Clickable whenever picking would actually do something — i.e.
          // anything except re-picking the queue we're already in.
          const interactable =
            !pending && isAvailable && model.id !== committedModelId
          const ahead = aheadByModel?.[model.id]
          const hint = !isAvailable
            ? 'Closed'
            : ahead === undefined
              ? ''
              : ahead === 0
                ? 'No wait'
                : `${ahead} ahead`

          const borderColor = isSelected
            ? theme.primary
            : (isFocused || isHovered) && interactable
              ? theme.foreground
              : theme.border

          return (
            <Button
              key={model.id}
              onClick={() => {
                setFocusedId(model.id)
                if (isAvailable) pick(model.id)
              }}
              onMouseOver={() => interactable && setHoveredId(model.id)}
              onMouseOut={() =>
                setHoveredId((curr) => (curr === model.id ? null : curr))
              }
              style={{
                borderStyle: 'single',
                borderColor,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              border={['top', 'bottom', 'left', 'right']}
            >
              <text>
                <span fg={indicatorColor}>{indicator} </span>
                <span
                  fg={labelColor}
                  attributes={
                    isSelected ? TextAttributes.BOLD : TextAttributes.NONE
                  }
                >
                  {model.displayName}
                </span>
                <span fg={theme.muted}> · {model.tagline}</span>
                {model.availability === 'deployment_hours' && (
                  <span fg={theme.muted}> · {deploymentAvailabilityLabel}</span>
                )}
                <span fg={theme.muted}> {hint.padEnd(hintWidth)}</span>
              </text>
            </Button>
          )
        })}
      </box>
    </box>
  )
}
