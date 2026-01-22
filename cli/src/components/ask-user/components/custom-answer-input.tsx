/**
 * Custom answer input component - MultilineInput wrapper for custom text answers
 */

import React, { memo } from 'react'

import { useTheme } from '../../../hooks/use-theme'
import { MultilineInput } from '../../multiline-input'

export interface CustomAnswerInputProps {
  value: string
  cursorPosition: number
  focused: boolean
  optionIndent: number
  onChange: (text: string, cursorPosition: number) => void
  onSubmit: () => void
  onPaste: (text: string) => void
}

export const CustomAnswerInput: React.FC<CustomAnswerInputProps> = memo(
  ({
    value,
    cursorPosition,
    focused,
    optionIndent,
    onChange,
    onSubmit,
    onPaste,
  }) => {
    const theme = useTheme()

    return (
      <box style={{ flexDirection: 'column', paddingLeft: optionIndent + 2 }}>
        <box
          style={{
            borderStyle: 'single',
            borderColor: theme.muted,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
        <MultilineInput
          value={value}
          cursorPosition={cursorPosition}
          onChange={(inputValue) => {
            onChange(inputValue.text, inputValue.cursorPosition)
          }}
          onSubmit={onSubmit}
          onPaste={(text) => {
            if (text) {
              onPaste(text)
            }
          }}
          focused={focused}
          maxHeight={5}
          minHeight={1}
          placeholder="Type your answer..."
          showScrollbar={true}
        />
        </box>
      </box>
    )
  },
)

CustomAnswerInput.displayName = 'CustomAnswerInput'
