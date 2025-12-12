import { memo, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

interface LoadPreviousButtonProps {
  hiddenCount: number
  onLoadMore: () => void
}

export const LoadPreviousButton = memo(
  ({ hiddenCount, onLoadMore }: LoadPreviousButtonProps) => {
    const theme = useTheme()
    const [isHovered, setIsHovered] = useState(false)

    return (
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          paddingTop: 1,
          paddingBottom: 1,
          width: '100%',
        }}
      >
        <Button
          onClick={onLoadMore}
          onMouseOver={() => setIsHovered(true)}
          onMouseOut={() => setIsHovered(false)}
          border
          borderStyle="single"
          borderColor={isHovered ? theme.foreground : theme.border}
          customBorderChars={BORDER_CHARS}
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            backgroundColor: 'transparent',
          }}
        >
          <text style={{ fg: isHovered ? theme.foreground : theme.muted }}>
            ↑ Load previous messages
          </text>
        </Button>
      </box>
    )
  },
)
