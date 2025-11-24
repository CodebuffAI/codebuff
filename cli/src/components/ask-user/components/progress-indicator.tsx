/**
 * Progress indicator component showing question completion status
 * Displays: ● = current, ○ = not answered, ✓ = answered
 * Dots are clickable to navigate between questions
 */

import React from 'react'
import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { SYMBOLS } from '../constants'

export interface ProgressIndicatorProps {
  currentIndex: number
  answeredStates: boolean[]
  allAnswered: boolean
  onNavigate?: (index: number) => void
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentIndex,
  answeredStates,
  allAnswered,
  onNavigate,
}) => {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'row', gap: 1, marginTop: 0 }}>
      {answeredStates.map((isAnswered, idx) => {
        const isCurrent = idx === currentIndex
        const symbol = isAnswered ? SYMBOLS.COMPLETED : isCurrent ? SYMBOLS.CURRENT : SYMBOLS.UNSELECTED
        const color = isAnswered
          ? theme.primary
          : isCurrent
          ? theme.foreground
          : theme.muted

        return (
          <Button
            key={idx}
            onClick={() => onNavigate?.(idx)}
            style={{ padding: 0 }}
          >
            <text style={{ fg: color }}>{symbol}</text>
          </Button>
        )
      })}
      {allAnswered && (
        <text style={{ fg: theme.primary, marginLeft: 1 }}>Complete! ✓</text>
      )}
    </box>
  )
}
