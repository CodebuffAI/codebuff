import { TextAttributes } from '@opentui/core'
import { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

interface ScrollToBottomButtonProps {
  onClick: () => void
}

export const ScrollToBottomButton = ({
  onClick,
}: ScrollToBottomButtonProps) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Button
      style={{ paddingLeft: 2, paddingRight: 2 }}
      onClick={onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text>
        <span
          fg={theme.info}
          attributes={hovered ? TextAttributes.BOLD : TextAttributes.DIM}
        >
          {hovered ? '↓ Scroll to bottom ↓' : '↓'}
        </span>
      </text>
    </Button>
  )
}
