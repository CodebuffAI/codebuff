import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { FREEBUFF_MODELS } from '@codebuff/common/constants/freebuff-models'

import { switchFreebuffModel } from '../hooks/use-freebuff-session'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'

import type { KeyEvent } from '@opentui/core'

/**
 * Lets the user pick which model's queue they're in. Tapping (or pressing the
 * row's number key) on a different model triggers a re-POST: the server moves
 * them to the back of the new model's queue.
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

  const pick = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === selectedModel) return
      setPending(modelId)
      switchFreebuffModel(modelId).finally(() => setPending(null))
    },
    [pending, selectedModel],
  )

  // Number-key shortcuts (1-9) so keyboard-only users can switch without
  // hunting for a clickable region.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        if (!/^[1-9]$/.test(name)) return
        const digit = Number(name)
        if (digit > FREEBUFF_MODELS.length) return
        const target = FREEBUFF_MODELS[digit - 1]
        if (target && target.id !== selectedModel) {
          key.preventDefault?.()
          pick(target.id)
        }
      },
      [pending, pick, selectedModel],
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
      <text style={{ fg: theme.muted, marginBottom: 1 }}>
        Model — tap or press 1-{FREEBUFF_MODELS.length} to switch
      </text>
      {FREEBUFF_MODELS.map((model, idx) => {
        const isSelected = model.id === selectedModel
        const isPending = pending === model.id
        const isHovered = hoveredId === model.id
        const indicator = isSelected ? '●' : '○'
        const indicatorColor = isSelected ? theme.primary : theme.muted
        const labelColor = isSelected ? theme.foreground : theme.muted
        const interactable = !pending && !isSelected
        const ahead = aheadByModel?.[model.id]
        const hint =
          ahead === undefined
            ? model.tagline
            : ahead === 0
              ? 'No wait'
              : `${ahead} ahead`
        return (
          <Button
            key={model.id}
            onClick={() => pick(model.id)}
            onMouseOver={() => interactable && setHoveredId(model.id)}
            onMouseOut={() => setHoveredId((curr) => (curr === model.id ? null : curr))}
            style={{ paddingLeft: 0, paddingRight: 1 }}
          >
            <text>
              <span fg={indicatorColor}>{indicator} </span>
              <span fg={theme.muted}>{idx + 1}. </span>
              <span
                fg={labelColor}
                attributes={isSelected ? TextAttributes.BOLD : TextAttributes.NONE}
              >
                {model.displayName}
              </span>
              <span fg={theme.muted}>  {hint}</span>
              {isPending && <span fg={theme.muted}>  switching…</span>}
              {isHovered && interactable && !isPending && (
                <span fg={theme.muted}>  ↵</span>
              )}
            </text>
          </Button>
        )
      })}
    </box>
  )
}
