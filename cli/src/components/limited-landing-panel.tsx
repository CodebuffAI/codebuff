import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useTheme } from '../hooks/use-theme'
import {
  getFreebuffModel,
  LIMITED_FREEBUFF_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import type { KeyEvent } from '@opentui/core'

interface LimitedLandingPanelProps {
  /** Pre-composed session-counter line (e.g. "0 of 5 sessions used · resets
   *  in 8h 21m"). Parent owns the colors so the "used" count can flip to
   *  the warning color when exhausted without this component re-deriving the
   *  quota math. */
  sessionCounter: React.ReactNode
  /** True when the shared per-day quota is fully spent. Disables the CTA. */
  isQuotaExhausted: boolean
}

/**
 * Limited-tier landing screen.
 *
 * Limited users only ever see one model, so this screen is a confirm gate,
 * not a picker. Layout reads top-down as: model identity → caveat (data
 * collection) → quota → CTA — so the action and the thing being acted on
 * stay visually grouped.
 */
export const LimitedLandingPanel: React.FC<LimitedLandingPanelProps> = ({
  sessionCounter,
  isQuotaExhausted,
}) => {
  const theme = useTheme()
  const model = getFreebuffModel(LIMITED_FREEBUFF_MODEL_ID)
  const [pending, setPending] = useState(false)

  const interactable = !pending && !isQuotaExhausted

  const start = useCallback(() => {
    if (!interactable) return
    setPending(true)
    joinFreebuffQueue(LIMITED_FREEBUFF_MODEL_ID).finally(() =>
      setPending(false),
    )
  }, [interactable])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        const name = key.name ?? ''
        const isCommit =
          name === 'return' || name === 'enter' || name === 'space'
        if (!isCommit || !interactable) return
        key.preventDefault?.()
        key.stopPropagation?.()
        start()
      },
      [interactable, start],
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
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {model.displayName}
        </span>
      </text>
      {model.warning && (
        <text style={{ fg: theme.muted, wrapMode: 'word' }}>
          {model.warning}
        </text>
      )}
      <text style={{ marginTop: 1, marginBottom: 1, wrapMode: 'word' }}>
        {sessionCounter}
      </text>
      <Button
        onClick={start}
        style={{
          borderStyle: 'single',
          borderColor: interactable ? theme.primary : theme.border,
          paddingLeft: 2,
          paddingRight: 2,
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text
          style={{ fg: interactable ? theme.primary : theme.muted }}
          attributes={TextAttributes.BOLD}
        >
          {pending ? (
            'Starting…'
          ) : (
            <>
              Start session<span fg={theme.muted}>{'   Enter'}</span>
            </>
          )}
        </text>
      </Button>
    </box>
  )
}
