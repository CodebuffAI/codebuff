import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useRef, useState } from 'react'

import { Button } from './button'
import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  getFreebuffModel,
  LIMITED_FREEBUFF_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

interface LimitedLandingPanelProps {
  /** Pre-composed session-counter line (e.g. "0 of 5 sessions used · resets
   *  in 8h 21m"). Parent owns the colors so the "used" count can flip to
   *  the warning color when exhausted without this component re-deriving the
   *  quota math. */
  sessionCounter: React.ReactNode
  /** Plain-text form of the same counter, used only to measure how many rows
   *  it wraps to so the scroll budget is exact. */
  sessionCounterText: string
  /** True when the shared per-day quota is fully spent. Disables the CTA. */
  isQuotaExhausted: boolean
  /** Max vertical rows the panel may occupy. When its content is taller the
   *  panel scrolls (scrollbar shown) instead of letting flexbox compress the
   *  bordered button onto its own border. */
  maxHeight: number
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
  sessionCounterText,
  isQuotaExhausted,
  maxHeight,
}) => {
  const theme = useTheme()
  const { contentMaxWidth } = useTerminalDimensions()
  const model = getFreebuffModel(LIMITED_FREEBUFF_MODEL_ID)
  const [pending, setPending] = useState(false)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  // Rendered height of the panel, matching the JSX below row-for-row so the
  // scroll budget is exact: name + warning (each wrap-aware) + the counter
  // line with its 1-row top/bottom margins + the 3-row bordered button.
  const wrappedRows = (text: string) =>
    Math.max(1, Math.ceil(text.length / contentMaxWidth))
  const contentHeight =
    wrappedRows(model.displayName) +
    (model.warning ? wrappedRows(model.warning) : 0) +
    1 /* counter marginTop */ +
    wrappedRows(sessionCounterText) +
    1 /* counter marginBottom */ +
    3 /* button: 2 border rows + label */
  const needsScroll = contentHeight > maxHeight
  const viewportHeight = Math.max(1, Math.min(contentHeight, maxHeight))

  // A scrollbox stretches to fill its parent, which would left-align the
  // panel; the old plain box sized to its content and the parent centered
  // it. Restore that by pinning the scrollbox to its content width (widest
  // of name / warning / counter / the bordered button) so `alignItems:
  // 'center'` on the parent can center the whole block again.
  const BUTTON_LABEL = 'Start session   Enter'
  const BUTTON_CHROME = 6 // 2 border + 4 padding (paddingLeft/Right 2)
  const panelWidth =
    Math.min(
      contentMaxWidth,
      Math.max(
        model.displayName.length,
        model.warning?.length ?? 0,
        sessionCounterText.length,
        BUTTON_LABEL.length + BUTTON_CHROME,
      ),
    ) + (needsScroll ? 1 : 0) /* scrollbar gutter */

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
    <scrollbox
      ref={scrollRef}
      scrollX={false}
      scrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        visible: needsScroll,
        trackOptions: { width: 1 },
      }}
      style={{
        height: viewportHeight,
        width: panelWidth,
        alignSelf: 'center',
        flexShrink: 0,
        rootOptions: {
          flexDirection: 'row',
          backgroundColor: 'transparent',
        },
        wrapperOptions: {
          border: false,
          backgroundColor: 'transparent',
          flexDirection: 'column',
        },
        contentOptions: {
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          backgroundColor: 'transparent',
        },
      }}
    >
      <text style={{ wrapMode: 'word', flexShrink: 0 }}>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {model.displayName}
        </span>
      </text>
      {model.warning && (
        <text style={{ fg: theme.muted, wrapMode: 'word', flexShrink: 0 }}>
          {model.warning}
        </text>
      )}
      <text
        style={{
          marginTop: 1,
          marginBottom: 1,
          wrapMode: 'word',
          flexShrink: 0,
        }}
      >
        {sessionCounter}
      </text>
      <Button
        onClick={start}
        style={{
          borderStyle: 'single',
          borderColor: interactable ? theme.primary : theme.border,
          paddingLeft: 2,
          paddingRight: 2,
          flexShrink: 0,
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text
          style={{ fg: interactable ? theme.foreground : theme.muted }}
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
    </scrollbox>
  )
}
