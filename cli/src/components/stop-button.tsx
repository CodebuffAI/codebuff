import { TextAttributes } from '@opentui/core'
import { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

interface StopButtonProps {
  onClick: () => void
}

export const StopButton = ({ onClick }: StopButtonProps) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Button
      style={{ paddingLeft: 1, paddingRight: 1 }}
      onClick={onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text>
        <span
          fg={theme.secondary}
          attributes={hovered ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          ■ Esc
        </span>
      </text>
    </Button>
  )
}
