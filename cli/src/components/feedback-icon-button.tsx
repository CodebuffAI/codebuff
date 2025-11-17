import { TextAttributes } from '@opentui/core'
import React, { useRef } from 'react'

import { useHoverToggle } from './agent-mode-toggle'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { logger } from '../utils/logger'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

interface FeedbackIconButtonProps {
  onClick?: () => void
  onClose?: () => void
  isOpen?: boolean
  messageId?: string
  selectedCategory?: string
}

export const FeedbackIconButton: React.FC<FeedbackIconButtonProps> = ({
  onClick,
  onClose,
  isOpen,
  messageId,
  selectedCategory,
}) => {
  const theme = useTheme()
  const hover = useHoverToggle()
  const hoveredOnceRef = useRef(false)

  const handleMouseOver = () => {
    hover.clearCloseTimer()
    hover.scheduleOpen()
    if (!hoveredOnceRef.current) {
      hoveredOnceRef.current = true
      logger.info(
        {
          eventId: AnalyticsEvent.FEEDBACK_BUTTON_HOVERED,
          messageId,
          source: 'cli',
        },
        'Feedback button hovered',
      )
    }
  }
  const handleMouseOut = () => hover.scheduleClose()

  // Determine which symbol to show based on selected category
  const getSymbol = () => {
    if (selectedCategory === 'good_result') {
      return '▲▽' // Good selected - filled up, outlined down
    } else if (selectedCategory === 'bad_result') {
      return '△▼' // Bad selected - outlined up, filled down
    }
    return '△▽' // Default - both outlined
  }

  const textCollapsed = `${getSymbol()}`
  const textExpanded = '[how was this?]'

  return (
    <Button
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 0,
        paddingRight: 0,
      }}
      onClick={() => (isOpen ? onClose?.() : onClick?.())}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text
        style={{
          wrapMode: 'none',
          fg: hover.isOpen || isOpen ? theme.foreground : theme.muted,
        }}
      >
        {hover.isOpen || isOpen ? (
          textExpanded
        ) : (
          <span attributes={TextAttributes.DIM}>{textCollapsed}</span>
        )}
      </text>
    </Button>
  )
}
