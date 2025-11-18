import { TextAttributes } from '@opentui/core'
import React, { useRef } from 'react'

import { useHoverToggle } from './agent-mode-toggle'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { logger } from '../utils/logger'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

interface FeedbackIconButtonProps {
  onClick: () => void
  onClose: () => void
  isOpen?: boolean
  messageId?: string
  selectedCategory?: string
  hasSubmittedFeedback?: boolean
}

export const FeedbackIconButton: React.FC<FeedbackIconButtonProps> = ({
  onClick,
  onClose,
  isOpen,
  messageId,
  selectedCategory,
  hasSubmittedFeedback = false,
}) => {
  const theme = useTheme()
  const hover = useHoverToggle()
  const hoveredOnceRef = useRef(false)
  const handleClick = () => {
    const action = isOpen ? onClose : onClick
    action()
  }

  const handleMouseOver = () => {
    if (hasSubmittedFeedback) return
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
  const handleMouseOut = () => {
    if (hasSubmittedFeedback) return
    hover.scheduleClose()
  }

  const symbolsByCategory: Record<string, string> = {
    good_result: '▲▽', // Good selected - filled up, outlined down
    bad_result: '△▼', // Bad selected - outlined up, filled down
  }
  const textCollapsed = symbolsByCategory[selectedCategory || ''] || '△▽'
  const textExpanded = '[how was this?]'

  return (
    <Button
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 0,
        paddingRight: 0,
      }}
      onClick={handleClick}
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
