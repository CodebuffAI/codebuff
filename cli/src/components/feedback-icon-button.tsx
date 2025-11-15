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
}

export const FeedbackIconButton: React.FC<FeedbackIconButtonProps> = ({ onClick, onClose, isOpen, messageId }) => {
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

  const textCollapsed = isOpen ? '[x]' : '[?]'
  const textExpanded = isOpen ? '[close x]' : '[share feedback]'

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
      <text style={{ wrapMode: 'none', fg: hover.isOpen ? theme.foreground : theme.muted }}>
        {hover.isOpen ? textExpanded : textCollapsed}
      </text>
    </Button>
  )
}
