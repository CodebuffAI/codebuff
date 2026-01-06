import React from 'react'

import { useTheme } from '../hooks/use-theme'

interface ProgressBarProps {
  /** Value from 0 to 100 */
  value: number
  /** Width in characters (default: 20) */
  width?: number
  /** Optional label to show before the bar */
  label?: string
  /** Show percentage text after the bar */
  showPercentage?: boolean
}

/**
 * Get color based on progress percentage - muted for normal, warning/error when low
 */
const getProgressColor = (
  value: number,
  theme: {
    primary: string
    foreground: string
    warning: string
    error: string
  },
): string => {
  if (value <= 10) return theme.error
  if (value <= 25) return theme.warning
  return theme.foreground
}

/**
 * Get color for the filled portion of the bar
 */
const getBarColor = (
  value: number,
  theme: { primary: string; warning: string; error: string },
): string => {
  if (value <= 10) return theme.error
  if (value <= 25) return theme.warning
  return theme.primary // Use primary for the bar itself
}

/**
 * Terminal progress bar component
 * Uses block characters for visual display
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  width = 20,
  label,
  showPercentage = true,
}) => {
  const theme = useTheme()
  const clampedValue = Math.max(0, Math.min(100, value))
  const filledWidth = Math.round((clampedValue / 100) * width)
  const emptyWidth = width - filledWidth

  const filledChar = '█'
  const emptyChar = '░'

  const filled = filledChar.repeat(filledWidth)
  const empty = emptyChar.repeat(emptyWidth)

  const barColor = getBarColor(clampedValue, theme)
  const textColor = getProgressColor(clampedValue, theme)

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      {label && <text style={{ fg: theme.muted }}>{label} </text>}
      <text style={{ fg: barColor }}>{filled}</text>
      <text style={{ fg: theme.muted }}>{empty}</text>
      {showPercentage && (
        <text style={{ fg: textColor }}> {Math.round(clampedValue)}%</text>
      )}
    </box>
  )
}
