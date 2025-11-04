import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useOpentuiPaste } from '../hooks/use-opentui-paste'
import { useTheme } from '../hooks/use-theme'

import type { PasteEvent, ScrollBoxRenderable } from '@opentui/core'

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

const CURSOR_CHAR = '┃'

interface MultilineInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onKeyIntercept?: (
    key: any,
    helpers: {
      value: string
      cursorPosition: number
      setValue: (newValue: string) => number
      setCursorPosition: (position: number) => void
    },
  ) => boolean
  placeholder?: string
  focused?: boolean
  maxHeight?: number
  width: number
  textAttributes?: number
}

export type MultilineInputHandle = {
  focus: () => void
}

export const MultilineInput = forwardRef<
  MultilineInputHandle,
  MultilineInputProps
>(function MultilineInput(
  {
    value,
    onChange,
    onSubmit,
    placeholder = '',
    focused = true,
    maxHeight = 5,
    width,
    textAttributes,
    onKeyIntercept,
  }: MultilineInputProps,
  forwardedRef,
) {
  const theme = useTheme()
  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const [cursorPosition, setCursorPosition] = useState(value.length)
  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => {
        const node = scrollBoxRef.current
        if (node && typeof (node as any).focus === 'function') {
          ;(node as any).focus()
        }
      },
    }),
    [],
  )

  // Sync cursor when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length)
    }
  }, [value.length, cursorPosition])

  useOpentuiPaste(
    useCallback(
      (event: PasteEvent) => {
        if (!focused) return

        const text = event.text ?? ''
        if (!text) return

        const newValue =
          value.slice(0, cursorPosition) + text + value.slice(cursorPosition)
        onChange(newValue)
        setCursorPosition(cursorPosition + text.length)
      },
      [focused, value, cursorPosition, onChange],
    ),
  )

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

        if (onKeyIntercept) {
          const handled = onKeyIntercept(key, {
            value,
            cursorPosition,
            setValue: (newValue: string) => {
              onChange(newValue)
              return newValue.length
            },
            setCursorPosition: (position: number) =>
              setCursorPosition(Math.max(0, position)),
          })
          if (handled) {
            return
          }
        }

        const lowerKeyName = (key.name ?? '').toLowerCase()
        const ESC = '\x1b'
        const isAltLikeModifier = Boolean(
          key.option ||
            (key.sequence?.length === 2 &&
              key.sequence[0] === ESC &&
              key.sequence[1] !== '['),
        )

        const isEnterKey = key.name === 'return' || key.name === 'enter'
        const hasEscapePrefix =
          typeof key.sequence === 'string' &&
          key.sequence.length > 0 &&
          key.sequence.charCodeAt(0) === 0x1b
        const isPlainEnter =
          isEnterKey &&
          !key.shift &&
          !key.ctrl &&
          !key.meta &&
          !key.alt &&
          !key.option &&
          !isAltLikeModifier &&
          !hasEscapePrefix &&
          key.sequence === '\r'
        const isShiftEnter =
          isEnterKey && (Boolean(key.shift) || key.sequence === '\n')
        const isOptionEnter =
          isEnterKey && (isAltLikeModifier || hasEscapePrefix)
        const isCtrlJ =
          key.ctrl &&
          !key.meta &&
          !key.option &&
          !key.alt &&
          (lowerKeyName === 'j' || isEnterKey)

        if (isEnterKey || lowerKeyName === 'j') {
          const snapshot: Record<string, unknown> = {
            name: key.name,
            sequence: key.sequence,
            raw: (key as any).raw,
            ctrl: Boolean(key.ctrl),
            meta: Boolean(key.meta),
            alt: Boolean(key.alt),
            option: Boolean(key.option),
            shift: Boolean(key.shift),
            isEnterKey,
            hasEscapePrefix,
            code: (key as any).code,
            charCode: key.sequence ? key.sequence.charCodeAt(0) : null,
          }
          try {
            const ownProps = Object.getOwnPropertyNames(key)
            for (const prop of ownProps) {
              if (prop in snapshot) continue
              const value = (key as any)[prop]
              if (typeof value === 'function') continue
              snapshot[prop] = value
            }
            for (const prop in key) {
              if (prop in snapshot) continue
              const value = (key as any)[prop]
              if (typeof value === 'function') continue
              snapshot[prop] = value
            }
          } catch {
            // ignore property introspection errors
          }
        }

        const shouldInsertNewline = isShiftEnter || isOptionEnter || isCtrlJ

        if (shouldInsertNewline) {
          if ('preventDefault' in key) (key as any).preventDefault()
          const newValue =
            value.slice(0, cursorPosition) + '\n' + value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition(cursorPosition + 1)
          return
        }

        if (isPlainEnter) {
          if ('preventDefault' in key) (key as any).preventDefault()
          onSubmit()
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

          const originalValue = value
          let newValue = originalValue
          let nextCursor = cursorPosition

          if (cursorPosition > lineStart) {
            newValue = value.slice(0, lineStart) + value.slice(cursorPosition)
            nextCursor = lineStart
          } else if (
            cursorPosition === lineStart &&
            cursorPosition > 0 &&
            value[cursorPosition - 1] === '\n'
          ) {
            newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            nextCursor = cursorPosition - 1
          } else if (cursorPosition > 0) {
            newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            nextCursor = cursorPosition - 1
          }

          if (newValue === originalValue) {
            return
          }

          onChange(newValue)
          setCursorPosition(Math.max(0, nextCursor))
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
        } // Cmd+Delete: Delete to line start; fallback to single delete if nothing changes
        if (key.name === 'delete' && key.meta && !isAltLikeModifier) {
          if ('preventDefault' in key) (key as any).preventDefault()

          const originalValue = value
          let newValue = originalValue
          let nextCursor = cursorPosition

          if (cursorPosition > 0) {
            if (
              cursorPosition === lineStart &&
              value[cursorPosition - 1] === '\n'
            ) {
              newValue =
                value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
              nextCursor = cursorPosition - 1
            } else {
              newValue = value.slice(0, lineStart) + value.slice(cursorPosition)
              nextCursor = lineStart
            }
          }

          if (newValue === originalValue && cursorPosition > 0) {
            newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            nextCursor = cursorPosition - 1
          }

          if (newValue === originalValue) {
            return
          }

          onChange(newValue)
          setCursorPosition(Math.max(0, nextCursor))
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
      [focused, value, cursorPosition, onChange, onSubmit, onKeyIntercept],
    ),
  )

  // Calculate display with cursor
  const displayValue = value || placeholder
  const isPlaceholder = !value && placeholder
  const showCursor = focused
  const beforeCursor = showCursor ? displayValue.slice(0, cursorPosition) : ''
  const afterCursor = showCursor ? displayValue.slice(cursorPosition) : ''
  const activeChar = afterCursor.charAt(0) || ' '
  const shouldHighlight =
    showCursor &&
    !isPlaceholder &&
    cursorPosition > 0 &&
    cursorPosition < displayValue.length

  const height = useMemo(() => {
    const maxCharsPerLine = Math.max(1, width - 4)
    const contentForHeight = showCursor
      ? shouldHighlight
        ? displayValue
        : `${displayValue.slice(0, cursorPosition)}${CURSOR_CHAR}${displayValue.slice(cursorPosition)}`
      : displayValue
    const lines = contentForHeight.split('\n')
    let totalLineCount = 0
    for (const line of lines) {
      const length = line.length
      if (length === 0) {
        totalLineCount += 1
      } else {
        totalLineCount += Math.ceil(length / maxCharsPerLine)
      }
    }
    return Math.max(1, Math.min(totalLineCount, maxHeight))
  }, [
    displayValue,
    cursorPosition,
    showCursor,
    shouldHighlight,
    width,
    maxHeight,
  ])

  const inputColor = isPlaceholder
    ? theme.muted
    : focused
      ? theme.inputFocusedFg
      : theme.inputFg

  const textStyle: Record<string, unknown> = {
    bg: 'transparent',
    fg: inputColor,
  }

  if (isPlaceholder) {
    textStyle.attributes = TextAttributes.DIM
  } else if (textAttributes !== undefined && textAttributes !== 0) {
    textStyle.attributes = textAttributes
  }

  const cursorFg = theme.info
  const highlightBg = '#7dd3fc' // Lighter blue for highlight background

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
          backgroundColor: 'transparent',
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
      <text style={textStyle}>
        {showCursor ? (
          <>
            {beforeCursor}
            {shouldHighlight ? (
              <span
                bg={highlightBg}
                fg={theme.background}
                attributes={TextAttributes.BOLD}
              >
                {activeChar === ' ' ? '\u00a0' : activeChar}
              </span>
            ) : (
              <span
                {...(cursorFg ? { fg: cursorFg } : undefined)}
                attributes={TextAttributes.BOLD}
              >
                {CURSOR_CHAR}
              </span>
            )}
            {shouldHighlight
              ? afterCursor.length > 0
                ? afterCursor.slice(1)
                : ''
              : afterCursor || ' '}
          </>
        ) : (
          displayValue
        )}
      </text>
    </scrollbox>
  )
})
