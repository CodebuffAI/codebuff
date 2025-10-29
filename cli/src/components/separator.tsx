import React from 'react'

import type { ChatTheme } from '../utils/theme-system'

interface SeparatorProps {
  theme: ChatTheme
  width: number
}

export const Separator = ({ theme, width }: SeparatorProps) => {
  return (
    <text
      content={'─'.repeat(width)}
      style={{ fg: theme.statusSecondary, height: 1, wrapMode: 'none' }}
    />
  )
}
