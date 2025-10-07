import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useKeyboard } from '@opentui/react'
import type { ScrollBoxRenderable } from '@opentui/core'
import { logger } from './logger'

// Helper functions for text manipulation
function findLineStart(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--
  }
  return pos
}

function findLineEnd(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))
  while (pos < text.length && text[pos] !== '\n') {
    pos++
  }
  return pos
}

function findPreviousWordBoundary(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos - 1])) {
    pos--
  }

  // Skip word characters backwards
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--
  }

  return pos
}

function findNextWordBoundary(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))

  // Skip non-whitespace forwards
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++
  }

  // Skip whitespace forwards
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++
  }

  return pos
}

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
  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const [cursorPosition, setCursorPosition] = useState(value.length)

  // Sync cursor when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length)
    }
  }, [value.length, cursorPosition])

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    const scrollBox = scrollBoxRef.current
    if (scrollBox && focused) {
      // Scroll to bottom after layout updates
      setTimeout(() => {
        const maxScroll = Math.max(
          0,
          scrollBox.scrollHeight - scrollBox.viewport.height,
        )
        scrollBox.verticalScrollBar.scrollPosition = maxScroll
      }, 0)
    }
  }, [value, cursorPosition, focused])

  // Handle all keyboard input with advanced shortcuts
  useKeyboard(
    useCallback(
      (key: any) => {
        if (!focused) return

        // Debug: log backspace/delete key events to help diagnose issues
        logger.info('key event:', {
          name: key.name,
          meta: key.meta,
          ctrl: key.ctrl,
          alt: key.alt,
          option: key.option,
          shift: key.shift,
          sequence: key.sequence,
        })

        const lowerKeyName = (key.name ?? '').toLowerCase()
        const ESC = '\x1b'
        const isAltLikeModifier = Boolean(
          key.option ||
            (key.sequence?.length === 2 &&
              key.sequence[0] === ESC &&
              key.sequence[1] !== '['),
        )

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

        // Calculate boundaries for shortcuts
        const lineStart = findLineStart(value, cursorPosition)
        const lineEnd = findLineEnd(value, cursorPosition)
        const wordStart = findPreviousWordBoundary(value, cursorPosition)
        const wordEnd = findNextWordBoundary(value, cursorPosition)

        // DELETION SHORTCUTS (check these first, before basic delete/backspace)

        // Ctrl+U: Delete to line start (also triggered by Cmd+Delete on macOS)
        if (key.ctrl && lowerKeyName === 'u' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue =
            value.slice(0, lineStart) + value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(lineStart)
          return
        }

        // Alt+Backspace or Ctrl+W: Delete word backward
        if (
          key.name === 'backspace' &&
          (isAltLikeModifier || (key.ctrl && lowerKeyName === 'w'))
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue =
            value.slice(0, wordStart) + value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(wordStart)
          return
        } // Cmd+Delete: Delete everything before cursor
        if (key.name === 'delete' && key.meta && !isAltLikeModifier) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue = value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(0)
          return
        } // Alt+Delete: Delete word forward
        if (key.name === 'delete' && isAltLikeModifier) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue = value.slice(0, cursorPosition) + value.slice(wordEnd)
          onChange(newValue)
          return
        }

        // Ctrl+K: Delete to line end
        if (key.ctrl && lowerKeyName === 'k' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue = value.slice(0, cursorPosition) + value.slice(lineEnd)
          onChange(newValue)
          return
        }

        // Ctrl+H: Delete char backward (Emacs)
        if (key.ctrl && lowerKeyName === 'h' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition > 0) {
            const newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            onChange(newValue)
            setCursorPosition(cursorPosition - 1)
          }
          return
        }

        // Ctrl+D: Delete char forward (Emacs)
        if (key.ctrl && lowerKeyName === 'd' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition < value.length) {
            const newValue =
              value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
            onChange(newValue)
          }
          return
        }

        // Basic Backspace (no modifiers)
        if (key.name === 'backspace' && !key.ctrl && !key.meta && !key.alt) {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition > 0) {
            const newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            onChange(newValue)
            setCursorPosition(cursorPosition - 1)
          }
          return
        }

        // Basic Delete (no modifiers)
        if (key.name === 'delete' && !key.ctrl && !key.meta && !key.alt) {
          if ('preventDefault' in key) (key as any).preventDefault()
          if (cursorPosition < value.length) {
            const newValue =
              value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
            onChange(newValue)
          }
          return
        }

        // NAVIGATION SHORTCUTS

        // Alt+Left/B: Word left
        if (
          isAltLikeModifier &&
          (key.name === 'left' || lowerKeyName === 'b')
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(wordStart)
          return
        }

        // Alt+Right/F: Word right
        if (
          isAltLikeModifier &&
          (key.name === 'right' || lowerKeyName === 'f')
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(wordEnd)
          return
        }

        // Cmd+Left, Ctrl+A, or Home: Line start
        if (
          (key.meta && key.name === 'left' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'a' && !key.meta && !key.option) ||
          (key.name === 'home' && !key.ctrl && !key.meta)
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(lineStart)
          return
        }

        // Cmd+Right, Ctrl+E, or End: Line end
        if (
          (key.meta && key.name === 'right' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'e' && !key.meta && !key.option) ||
          (key.name === 'end' && !key.ctrl && !key.meta)
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(lineEnd)
          return
        }

        // Cmd+Up or Ctrl+Home: Document start
        if (
          (key.meta && key.name === 'up') ||
          (key.ctrl && key.name === 'home')
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(0)
          return
        }

        // Cmd+Down or Ctrl+End: Document end
        if (
          (key.meta && key.name === 'down') ||
          (key.ctrl && key.name === 'end')
        ) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(value.length)
          return
        }

        // Ctrl+B: Backward char (Emacs)
        if (key.ctrl && lowerKeyName === 'b' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.max(0, cursorPosition - 1))
          return
        }

        // Ctrl+F: Forward char (Emacs)
        if (key.ctrl && lowerKeyName === 'f' && !key.meta && !key.option) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.min(value.length, cursorPosition + 1))
          return
        }

        // Left arrow (no modifiers)
        if (key.name === 'left' && !key.ctrl && !key.meta && !key.alt) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.max(0, cursorPosition - 1))
          return
        }

        // Right arrow (no modifiers)
        if (key.name === 'right' && !key.ctrl && !key.meta && !key.alt) {
          if ('preventDefault' in key) (key as any).preventDefault()
          setCursorPosition(Math.min(value.length, cursorPosition + 1))
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

  // Memoize height calculation to avoid expensive computation on every render
  const height = useMemo(() => {
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
    return Math.max(1, Math.min(totalLineCount, maxHeight))
  }, [displayValue, width, focused, isPlaceholder, maxHeight])

  return (
    <scrollbox
      ref={scrollBoxRef}
      scrollX={false}
      stickyScroll={true}
      stickyStart="bottom"
      scrollbarOptions={{ visible: false }}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        rootOptions: {
          width: '100%',
          height: height,
          backgroundColor: focused ? theme.inputFocusedBg : theme.inputBg,
          flexGrow: 0,
          flexShrink: 0,
        },
        wrapperOptions: {
          paddingLeft: 1,
          paddingRight: 1,
          border: false,
        },
        contentOptions: {
          justifyContent: 'flex-end',
        },
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
    </scrollbox>
  )
}
