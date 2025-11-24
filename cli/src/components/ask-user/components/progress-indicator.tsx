/**
 * Progress indicator component showing question completion status
 * Displays: ● = current, ○ = not answered, ✓ = answered
 */

import React from 'react'
import { useTheme } from '../../../hooks/use-theme'
import { SYMBOLS } from '../constants'

export interface ProgressIndicatorProps {
  currentIndex: number
  answeredStates: boolean[]
  allAnswered: boolean
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentIndex,
  answeredStates,
  allAnswered,
}) => {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'row', gap: 1, marginTop: 0 }}>
      {answeredStates.map((isAnswered, idx) => {
        const isCurrent = idx === currentIndex
        return (
          <text
            key={idx}
            style={{
              fg: isAnswered
                ? theme.primary
                : isCurrent
                ? theme.foreground
                : theme.muted,
            }}
          >
            {isAnswered ? SYMBOLS.COMPLETED : isCurrent ? SYMBOLS.CURRENT : SYMBOLS.UNSELECTED}
          </text>
        )
      })}
      {allAnswered && (
        <text style={{ fg: theme.primary, marginLeft: 1 }}>Complete! ✓</text>
      )}
    </box>
  )
}
