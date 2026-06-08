import { TextAttributes } from '@opentui/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { safeOpen } from '../../utils/open-url'
import { Button } from '../button'

import type { ToolRenderConfig } from './types'
import type { RenderUIButtonWidget } from '@codebuff/common/tools/params/tool/render-ui'

type RenderUIButtonVariant = NonNullable<RenderUIButtonWidget['variant']>

const isRenderUIButtonWidget = (
  widget: unknown,
): widget is RenderUIButtonWidget => {
  if (widget === null || typeof widget !== 'object') {
    return false
  }

  const candidate = widget as Partial<RenderUIButtonWidget>
  return (
    candidate.type === 'button' &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length > 0 &&
    typeof candidate.link === 'string' &&
    candidate.link.trim().length > 0 &&
    (candidate.variant === undefined ||
      candidate.variant === 'primary' ||
      candidate.variant === 'secondary')
  )
}

/**
 * The button is an accent-colored outline with a matching label. It stays
 * unfilled in every state — a fill would bleed past the rounded corners — so
 * hover is signalled by underlining the label rather than inverting the fill.
 */
const getButtonColors = (
  theme: ReturnType<typeof useTheme>,
  variant: RenderUIButtonVariant,
) => {
  const accent = variant === 'secondary' ? theme.secondary : theme.primary
  return {
    // Unfilled: the interior shows the terminal background in every state.
    backgroundColor: undefined,
    foregroundColor: accent,
    borderColor: accent,
  }
}

const CLICK_FLASH_DURATION_MS = 150

const RenderUIButton = ({ widget }: { widget: RenderUIButtonWidget }) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [isClicked, setIsClicked] = useState(false)
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const variant = widget.variant ?? 'primary'
  const { backgroundColor, foregroundColor, borderColor } = getButtonColors(
    theme,
    variant,
  )

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
    }
  }, [])

  const handleClick = useCallback(() => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }
    setIsClicked(true)
    safeOpen(widget.link)
    clickTimeoutRef.current = setTimeout(
      () => setIsClicked(false),
      CLICK_FLASH_DURATION_MS,
    )
  }, [widget.link])

  // Bold reads as a button label; underline on hover signals it's clickable;
  // dim briefly on click to acknowledge the press.
  const textAttributes = isClicked
    ? TextAttributes.DIM
    : isHovered
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.BOLD

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Button
        onClick={handleClick}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        style={{
          backgroundColor,
          borderStyle: 'rounded',
          borderColor,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text>
          <span fg={foregroundColor} attributes={textAttributes}>
            {widget.text}
          </span>
          {/* Trailing arrow signals the button opens an external link. */}
          <span fg={foregroundColor} attributes={textAttributes}>{' ↗'}</span>
        </text>
      </Button>
    </box>
  )
}

export const RenderUIComponent = defineToolComponent({
  toolName: 'render_ui',

  render(toolBlock): ToolRenderConfig {
    const widget = toolBlock.input?.widget

    if (!isRenderUIButtonWidget(widget)) {
      return { content: null }
    }

    return {
      content: <RenderUIButton widget={widget} />,
      collapsedPreview: `${widget.text} -> ${widget.link}`,
    }
  },
})
