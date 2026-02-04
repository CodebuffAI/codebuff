import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { useReviewStore } from '../state/review-store'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { KeyEvent } from '@opentui/core'

type ReviewMode = 'select' | 'custom'

interface ReviewOption {
  id: string
  label: string
  icon: string
}

const REVIEW_OPTIONS: ReviewOption[] = [
  { id: 'uncommitted', label: 'Uncommitted changes', icon: '' },
  { id: 'branch', label: 'This branch vs main', icon: '' },
  { id: 'custom', label: 'Custom...', icon: '' },
]

interface ReviewScreenProps {
  onSelectOption: (reviewText: string) => void
  onCancel: () => void
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  onSelectOption,
  onCancel,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<ReviewMode>('select')

  const { customInput, customCursor, setCustomText, setCustomCursor } =
    useReviewStore(
      useShallow((state) => ({
        customInput: state.customText,
        customCursor: state.customCursor,
        setCustomText: state.setCustomText,
        setCustomCursor: state.setCustomCursor,
      })),
    )

  // If there's prefilled custom text, go directly to custom mode
  useEffect(() => {
    if (useReviewStore.getState().customText.length > 0) {
      setMode('custom')
    }
  }, [])

  const handleSelect = useCallback(
    (option: ReviewOption) => {
      if (option.id === 'custom') {
        setMode('custom')
        return
      }

      let reviewText: string
      switch (option.id) {
        case 'uncommitted':
          reviewText = '@GPT-5 Agent Please review: uncommitted changes'
          break
        case 'branch':
          reviewText = '@GPT-5 Agent Please review: this branch compared to main'
          break
        default:
          return
      }
      onSelectOption(reviewText)
    },
    [onSelectOption],
  )

  const handleCustomSubmit = useCallback(() => {
    if (customInput.trim()) {
      onSelectOption(`@GPT-5 Agent Please review: ${customInput.trim()}`)
    }
  }, [customInput, onSelectOption])

  // Handle keyboard in select mode
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (mode !== 'select') return

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
      [mode, selectedIndex, handleSelect, onCancel],
    ),
  )

  // Handle key intercept for custom mode
  const handleKeyIntercept = useCallback(
    (key: KeyEvent) => {
      if (key.name === 'escape') {
        if (customInput.length > 0) {
          setCustomText('')
          setCustomCursor(0)
        } else {
          setMode('select')
        }
        return true
      }
      if (key.ctrl && key.name === 'c') {
        onCancel()
        return true
      }
      return false
    },
    [customInput, onCancel, setCustomText, setCustomCursor],
  )

  const handlePaste = useCallback(
    (text?: string) => {
      if (!text) return
      const before = customInput.slice(0, customCursor)
      const after = customInput.slice(customCursor)
      const newText = before + text + after
      setCustomText(newText)
      setCustomCursor(before.length + text.length)
    },
    [customInput, customCursor, setCustomText, setCustomCursor],
  )

  if (mode === 'custom') {
    return (
      <box
        title=" Custom review "
        titleAlignment="center"
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.primary,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'column',
        }}
      >
        <MultilineInput
          value={customInput}
          onChange={({ text, cursorPosition }) => {
            setCustomText(text)
            setCustomCursor(cursorPosition)
          }}
          onSubmit={handleCustomSubmit}
          onPaste={handlePaste}
          onKeyIntercept={handleKeyIntercept}
          placeholder="What would you like to review?"
          focused={true}
          maxHeight={3}
          minHeight={1}
          cursorPosition={customCursor}
        />
        <text style={{ fg: theme.muted }}>
          Enter to submit · Esc to clear/back
        </text>
      </box>
    )
  }

  return (
    <box
      title=" Review "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.primary,
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
              fg: isSelected ? theme.primary : theme.foreground,
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
