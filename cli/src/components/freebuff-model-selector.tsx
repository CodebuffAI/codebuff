import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { FREEBUFF_MODELS } from '@codebuff/common/constants/freebuff-models'

import { switchFreebuffModel } from '../hooks/use-freebuff-session'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useTheme } from '../hooks/use-theme'

import type { KeyEvent } from '@opentui/core'

interface FreebuffModelSelectorProps {
  /** Disables interaction while a switch / refresh is mid-flight so the user
   *  can't queue up a second switch and double-bounce themselves to the back
   *  of yet another queue. */
  disabled?: boolean
}

/**
 * Lets the user pick which model's queue they're in. Tapping (or pressing the
 * row's number key) on a different model triggers a re-POST: the server moves
 * them to the back of the new model's queue.
 */
export const FreebuffModelSelector: React.FC<FreebuffModelSelectorProps> = ({
  disabled = false,
}) => {
  const theme = useTheme()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const pick = useCallback(
    (modelId: string) => {
      if (disabled || pending) return
      if (modelId === selectedModel) return
      setPending(modelId)
      switchFreebuffModel(modelId).finally(() => setPending(null))
    },
    [disabled, pending, selectedModel],
  )

  // Number-key shortcuts (1-9) so keyboard-only users can switch without
  // hunting for a clickable region.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (disabled || pending) return
        const digit = parseInt(key.name ?? '', 10)
        if (!Number.isFinite(digit) || digit < 1 || digit > FREEBUFF_MODELS.length) {
          return
        }
        const target = FREEBUFF_MODELS[digit - 1]
        if (target && target.id !== selectedModel) {
          key.preventDefault?.()
          pick(target.id)
        }
      },
      [disabled, pending, pick, selectedModel],
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
        const interactable = !disabled && !pending && !isSelected
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
              <span fg={theme.muted}>  {model.tagline}</span>
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
