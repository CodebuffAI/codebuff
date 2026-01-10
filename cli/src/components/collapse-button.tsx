import { memo } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

import type { CSSProperties } from 'react'

interface CollapseButtonProps {
  onClick: () => void
  style?: CSSProperties
}

/**
 * Reusable collapse button with '▴ collapse' text
 * Styled with theme.secondary color, aligned to the right by default
 */
export const CollapseButton = memo(({ onClick, style }: CollapseButtonProps) => {
  const theme = useTheme()

  return (
    <Button
      style={{
        alignSelf: 'flex-end',
        marginTop: 0,
        ...style,
      }}
      onClick={onClick}
    >
      <text fg={theme.secondary} style={{ wrapMode: 'none' }}>
        ▴ collapse
      </text>
    </Button>
  )
})
