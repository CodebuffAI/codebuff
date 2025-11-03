import React from 'react'

import { useTheme } from '../hooks/use-theme'

interface SeparatorProps {
  width: number
}

export const Separator = ({ width }: SeparatorProps) => {
  const theme = useTheme()

  return (
    <text
      content={'─'.repeat(width)}
      style={{ fg: theme.statusSecondary, height: 1, wrapMode: 'none' }}
    />
  )
}
