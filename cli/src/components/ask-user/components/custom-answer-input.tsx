/**
 * Custom answer input component - MultilineInput wrapper for custom text answers
 */

import React, { memo } from 'react'

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
    return (
      <box style={{ flexDirection: 'column', paddingLeft: optionIndent + 2 }}>
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
          maxHeight={3}
          minHeight={1}
          placeholder="Type your answer..."
        />
      </box>
    )
  },
)

CustomAnswerInput.displayName = 'CustomAnswerInput'
