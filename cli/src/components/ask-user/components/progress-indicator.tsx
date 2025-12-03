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
  isOnConfirmScreen: boolean
  onNavigate?: (index: number) => void
  onNavigateToConfirm?: () => void
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentIndex,
  answeredStates,
  isOnConfirmScreen,
  onNavigate,
  onNavigateToConfirm,
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
      {/* Confirm dot - always clickable */}
      <Button
        onClick={() => onNavigateToConfirm?.()}
        style={{ padding: 0 }}
      >
        <text style={{ fg: isOnConfirmScreen ? theme.primary : theme.muted }}>
          {isOnConfirmScreen ? SYMBOLS.CURRENT : SYMBOLS.UNSELECTED}
        </text>
      </Button>
    </box>
  )
}
