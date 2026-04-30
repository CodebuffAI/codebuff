import { TextAttributes } from '@opentui/core'
import { useCallback, useState } from 'react'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { safeOpen } from '../../utils/open-url'
import { Button } from '../button'

import type { ChatTheme } from '../../types/theme-system'
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

const getButtonColors = (
  theme: ChatTheme,
  variant: RenderUIButtonVariant,
  isHovered: boolean,
  status: 'idle' | 'opened' | 'failed',
) => {
  if (status === 'failed') {
    return {
      backgroundColor: theme.surface,
      foregroundColor: theme.error,
    }
  }

  if (status === 'opened') {
    return {
      backgroundColor: theme.surface,
      foregroundColor: theme.success,
    }
  }

  if (variant === 'secondary') {
    return {
      backgroundColor: isHovered ? theme.surfaceHover : theme.surface,
      foregroundColor: theme.foreground,
    }
  }

  return {
    backgroundColor: theme.primary,
    foregroundColor: theme.name === 'dark' ? '#111827' : '#ffffff',
  }
}

const RenderUIButton = ({ widget }: { widget: RenderUIButtonWidget }) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [status, setStatus] = useState<'idle' | 'opened' | 'failed'>('idle')
  const variant = widget.variant ?? 'primary'
  const { backgroundColor, foregroundColor } = getButtonColors(
    theme,
    variant,
    isHovered,
    status,
  )

  const handleClick = useCallback(async () => {
    const opened = await safeOpen(widget.link)
    setStatus(opened ? 'opened' : 'failed')
  }, [widget.link])

  const statusText =
    status === 'opened'
      ? 'Opened'
      : status === 'failed'
        ? `Could not open: ${widget.link}`
        : ''

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: statusText ? 1 : 0,
      }}
    >
      <Button
        onClick={handleClick}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        style={{
          backgroundColor,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text>
          <span
            fg={foregroundColor}
            attributes={isHovered ? TextAttributes.BOLD : undefined}
          >
            {widget.text}
          </span>
        </text>
      </Button>
      <text style={{ wrapMode: 'word' }}>
        <span fg={status === 'failed' ? theme.error : theme.muted}>
          {statusText}
        </span>
      </text>
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
