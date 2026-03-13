import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { buildReviewPrompt, REVIEW_BASE_PROMPT } from '../commands/prompt-builders'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { KeyEvent } from '@opentui/core'

interface ReviewOption {
  id: string
  label: string
}

const REVIEW_OPTIONS: ReviewOption[] = [
  { id: 'uncommitted', label: 'Uncommitted changes' },
  { id: 'branch', label: 'This branch vs main' },
  { id: 'custom', label: 'Custom...' },
]

// Re-export for backward compatibility
export { REVIEW_BASE_PROMPT }

interface ReviewScreenProps {
  onSelectOption: (reviewText: string) => void
  onCustom: () => void
  onCancel: () => void
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  onSelectOption,
  onCustom,
  onCancel,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleSelect = useCallback(
    (option: ReviewOption) => {
      if (option.id === 'custom') {
        onCustom()
        return
      }

      const scope = option.id as 'uncommitted' | 'branch'
      const reviewText = buildReviewPrompt(scope)
      onSelectOption(reviewText)
    },
    [onSelectOption, onCustom],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'up') {
          setSelectedIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((prev) => Math.min(REVIEW_OPTIONS.length - 1, prev + 1))
          return
        }
        if (key.name === 'return' || key.name === 'enter') {
          const option = REVIEW_OPTIONS[selectedIndex]
          if (option) {
            handleSelect(option)
          }
          return
        }
        if (key.name === 'escape') {
          onCancel()
          return
        }
      },
      [selectedIndex, handleSelect, onCancel],
    ),
  )

  return (
    <box
      title=" Review "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {REVIEW_OPTIONS.map((option, index) => {
        const isSelected = index === selectedIndex
        return (
          <text
            key={option.id}
            style={{
              fg: isSelected ? theme.info : theme.foreground,
              bg: isSelected ? theme.surface : undefined,
            }}
          >
            {isSelected ? '❯ ' : '  '}
            {option.label}
          </text>
        )
      })}
      <text style={{ fg: theme.muted }}>
        ↑↓ navigate · Enter select · Esc cancel
      </text>
    </box>
  )
}
