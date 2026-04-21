import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import { FREEBUFF_MODELS } from '@codebuff/common/constants/freebuff-models'

import { switchFreebuffModel } from '../hooks/use-freebuff-session'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'

import type { KeyEvent } from '@opentui/core'

/**
 * Lets the user pick which model's queue they're in. Switching triggers a
 * re-POST: the server moves them to the back of the new model's queue, which
 * means switching is *not free* — they lose their place in the original line.
 *
 * To prevent accidental queue loss, keyboard navigation is two-step: Tab /
 * arrow keys move a focus highlight, and Enter commits the switch. Mouse
 * clicks are still one-step (the click target is intentional).
 *
 * Each row shows a live "N ahead" count sourced from the server's
 * `queueDepthByModel` snapshot so the choice is informed (e.g. "3 ahead" vs
 * "12 ahead") rather than a blind preference toggle.
 */
export const FreebuffModelSelector: React.FC = () => {
  const theme = useTheme()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
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

  // For the user's current queue, "ahead" is `position - 1` (themselves don't
  // count). For every other queue, switching would land them at the back, so
  // it's that queue's full depth. Null before the first queued snapshot so
  // the UI doesn't flash misleading zeros.
  const aheadByModel = useMemo<Record<string, number> | null>(() => {
    if (session?.status !== 'queued') return null
    const depths = session.queueDepthByModel ?? {}
    const out: Record<string, number> = {}
    for (const { id } of FREEBUFF_MODELS) {
      out[id] =
        id === session.model ? Math.max(0, session.position - 1) : depths[id] ?? 0
    }
    return out
  }, [session])

  // Pad the trailing hint ("3 ahead", "No wait", "…") to a fixed width so
  // buttons don't visibly resize when the queue depth ticks down (12 → 9) or
  // when the user's selection moves between queues. The tagline is shown
  // inline with the name now, so it's no longer part of this slot.
  const hintWidth = useMemo(
    () => Math.max('No wait'.length, '999 ahead'.length),
    [],
  )

  const pick = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === selectedModel) return
      setPending(modelId)
      switchFreebuffModel(modelId).finally(() => setPending(null))
    },
    [pending, selectedModel],
  )

  // Tab / Shift+Tab and Left/Right arrow keys move the focus highlight only;
  // Enter or Space commits the switch. Two-step navigation prevents the user
  // from accidentally giving up their place in line by tabbing past their
  // queue. Up/Down intentionally do nothing so they don't fight other
  // vertical UI.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        const isForward = name === 'right' || (name === 'tab' && !key.shift)
        const isBackward = name === 'left' || (name === 'tab' && key.shift)
        const isCommit = name === 'return' || name === 'enter' || name === 'space'
        if (!isForward && !isBackward && !isCommit) return
        if (isCommit) {
          if (focusedId !== selectedModel) {
            key.preventDefault?.()
            pick(focusedId)
          }
          return
        }
        const currentIdx = FREEBUFF_MODELS.findIndex((m) => m.id === focusedId)
        if (currentIdx === -1) return
        const len = FREEBUFF_MODELS.length
        const nextIdx = isForward
          ? (currentIdx + 1) % len
          : (currentIdx - 1 + len) % len
        const target = FREEBUFF_MODELS[nextIdx]
        if (target) {
          key.preventDefault?.()
          setFocusedId(target.id)
        }
      },
      [pending, pick, focusedId, selectedModel],
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
          flexDirection: 'row',
          gap: 2,
        }}
      >
        {FREEBUFF_MODELS.map((model) => {
          const isSelected = model.id === selectedModel
          const isHovered = hoveredId === model.id
          const isFocused = focusedId === model.id && !isSelected
          const indicator = isSelected ? '●' : '○'
          const indicatorColor = isSelected ? theme.primary : theme.muted
          const labelColor = isSelected ? theme.foreground : theme.muted
          const interactable = !pending && !isSelected
          const ahead = aheadByModel?.[model.id]
          const hint =
            ahead === undefined ? '' : ahead === 0 ? 'No wait' : `${ahead} ahead`

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
                pick(model.id)
              }}
              onMouseOver={() => interactable && setHoveredId(model.id)}
              onMouseOut={() => setHoveredId((curr) => (curr === model.id ? null : curr))}
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
                  attributes={isSelected ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  {model.displayName}
                </span>
                <span fg={theme.muted}> · {model.tagline}</span>
                <span fg={theme.muted}>  {hint.padEnd(hintWidth)}</span>
              </text>
            </Button>
          )
        })}
      </box>
    </box>
  )
}
