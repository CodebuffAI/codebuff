import { useCallback, useState, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'

interface MultilineInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  focused?: boolean
  maxHeight?: number
  theme: {
    inputBg: string
    inputFocusedBg: string
    inputFg: string
    inputFocusedFg: string
    inputPlaceholder: string
    cursor: string
  }
  width: number
}

export function MultilineInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  focused = true,
  maxHeight = 5,
  theme,
  width,
}: MultilineInputProps) {
  const [cursorPosition, setCursorPosition] = useState(value.length)

  // Sync cursor when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length)
    }
  }, [value.length, cursorPosition])

  // Handle all keyboard input
  useKeyboard(
    useCallback(
      (key: any) => {
        if (!focused) return

        // Enter (without shift) submits
        if (key.name === 'return' && !key.shift) {
          if ('preventDefault' in key) (key as any).preventDefault()
          onSubmit()
          return
        }

        // Shift+Enter creates newline
        if (key.name === 'return' && key.shift) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue =
            value.slice(0, cursorPosition) + '\n' + value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(cursorPosition + 1)
          return
        }

        // Backspace
        if (key.name === 'backspace') {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition > 0) {
            const newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            onChange(newValue)
            setCursorPosition(cursorPosition - 1)
          }
          return
        }

        // Delete
        if (key.name === 'delete') {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition < value.length) {
            const newValue =
              value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
            onChange(newValue)
          }
          return
        }

        // Left arrow
        if (key.name === 'left') {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.max(0, cursorPosition - 1))
          return
        }

        // Right arrow
        if (key.name === 'right') {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.min(value.length, cursorPosition + 1))
          return
        }

        // Home - go to start of current line
        if (key.name === 'home') {
          if ('preventDefault' in key) (key as any).preventDefault()
          const beforeCursor = value.slice(0, cursorPosition)
          const lastNewline = beforeCursor.lastIndexOf('\n')
          setCursorPosition(lastNewline === -1 ? 0 : lastNewline + 1)
          return
        }

        // End - go to end of current line
        if (key.name === 'end') {
          if ('preventDefault' in key) (key as any).preventDefault()
          const afterCursor = value.slice(cursorPosition)
          const nextNewline = afterCursor.indexOf('\n')
          setCursorPosition(
            nextNewline === -1 ? value.length : cursorPosition + nextNewline,
          )
          return
        }

        // Regular character input
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta &&
          !key.alt
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue =
            value.slice(0, cursorPosition) +
            key.sequence +
            value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(cursorPosition + 1)
          return
        }
      },
      [focused, value, cursorPosition, onChange, onSubmit],
    ),
  )

  // Calculate display with cursor
  const displayValue = value || placeholder
  const isPlaceholder = !value && placeholder
  const displayText =
    focused && !isPlaceholder
      ? displayValue.slice(0, cursorPosition) +
        '█' +
        displayValue.slice(cursorPosition)
      : displayValue

  // Calculate height based on wrapped lines
  const maxCharsPerLine = Math.max(1, width - 4)
  const lines = displayValue.split('\n')
  let totalLineCount = 0
  for (const line of lines) {
    if (line.length === 0) {
      totalLineCount += 1
    } else {
      // Account for cursor character which adds 1 to display length
      const displayLength =
        focused && !isPlaceholder ? line.length + 1 : line.length
      totalLineCount += Math.ceil(displayLength / maxCharsPerLine)
    }
  }
  const height = Math.max(1, Math.min(totalLineCount, maxHeight))

  return (
    <box
      style={{
        width: '100%',
        height: height,
        backgroundColor: focused ? theme.inputFocusedBg : theme.inputBg,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        wrap
        style={{
          fg: isPlaceholder
            ? theme.inputPlaceholder
            : focused
              ? theme.inputFocusedFg
              : theme.inputFg,
        }}
      >
        {displayText}
      </text>
    </box>
  )
}
