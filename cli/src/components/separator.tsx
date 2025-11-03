import React from 'react'

import type { ChatTheme } from '../types/theme-system'

interface SeparatorProps {
  theme: ChatTheme
  width: number
}

export const Separator = ({ theme, width }: SeparatorProps) => {
  return (
    <text
      content={'─'.repeat(width)}
      wrap={false}
      style={{ fg: theme.statusSecondary, height: 1 }}
    />
  )
}
