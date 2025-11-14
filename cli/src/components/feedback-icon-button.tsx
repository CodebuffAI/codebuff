import React, { useRef } from 'react'

import { useHoverToggle } from './agent-mode-toggle'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { logger } from '../utils/logger'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

interface FeedbackIconButtonProps {
  onClick?: () => void
  messageId?: string
}

export const FeedbackIconButton: React.FC<FeedbackIconButtonProps> = ({ onClick, messageId }) => {
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

  const textCollapsed = '[?]'
  const textExpanded = '[share feedback]'

  return (
    <Button
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        borderStyle: 'single',
        borderColor: hover.isOpen ? theme.foreground : theme.border,
        customBorderChars: BORDER_CHARS,
      }}
      onClick={() => onClick?.()}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text style={{ wrapMode: 'none', fg: theme.foreground }}>
        {hover.isOpen ? textExpanded : textCollapsed}
      </text>
    </Button>
  )
}
