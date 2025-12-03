/**
 * Question option component (radio button or checkbox)
 * Phase 1: Single-select (radio) only
 * Phase 2: Multi-select (checkbox) support
 */

import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { SYMBOLS } from '../constants'

export interface QuestionOptionProps {
  option: string | { label: string; description?: string }
  optionIndex: number
  isSelected: boolean
  isFocused: boolean
  isMultiSelect?: boolean // Phase 2 feature
  onSelect: () => void
  onMouseOver: () => void
}

export const QuestionOption: React.FC<QuestionOptionProps> = memo(
  ({
    option,
    isSelected,
    isFocused,
    isMultiSelect = false, // Phase 1: always false
    onSelect,
    onMouseOver,
  }) => {
    const theme = useTheme()

    // Extract label and description (Phase 2 feature)
    const label = typeof option === 'string' ? option : option.label
    const description = typeof option === 'object' ? option.description : undefined

    // Determine symbol based on selection type
    const symbol = isMultiSelect
      ? isSelected
        ? SYMBOLS.CHECKBOX_CHECKED
        : SYMBOLS.CHECKBOX_UNCHECKED
      : isSelected
      ? SYMBOLS.SELECTED
      : SYMBOLS.UNSELECTED

    return (
      <Button
        onClick={onSelect}
        onMouseOver={onMouseOver}
        style={{
          flexDirection: 'column',
          gap: 0,
          backgroundColor: isFocused ? theme.surface : undefined,
          marginBottom: 0,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        <box style={{ flexDirection: 'row', gap: 1 }}>
          <text
            style={{
              fg: isSelected ? theme.primary : isFocused ? theme.foreground : theme.muted,
              attributes: isFocused ? TextAttributes.BOLD : undefined,
            }}
          >
            {symbol}
          </text>
          <text
            style={{
              fg: isSelected ? theme.primary : isFocused ? theme.foreground : theme.muted,
              attributes: isFocused ? TextAttributes.BOLD : undefined,
            }}
          >
            {label}
          </text>
        </box>
        {/* Phase 2: Show description on focus */}
        {isFocused && description && (
          <text
            style={{
              fg: theme.muted,
              marginLeft: 3,
              attributes: TextAttributes.ITALIC,
            }}
          >
            {description}
          </text>
        )}
      </Button>
    )
  },
  // Memo comparison: only re-render if these props change
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.isFocused === next.isFocused &&
      prev.option === next.option &&
      prev.isMultiSelect === next.isMultiSelect
    )
  }
)

QuestionOption.displayName = 'QuestionOption'
