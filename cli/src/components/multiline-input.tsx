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
import { computeInputLayoutMetrics } from '../utils/text-layout'

import type { InputValue } from '../state/chat-store'
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

const CURSOR_CHAR = '▍'

type KeyWithPreventDefault =
  | {
      preventDefault?: () => void
    }
  | null
  | undefined

function preventKeyDefault(key: KeyWithPreventDefault) {
  key?.preventDefault?.()
}

interface MultilineInputProps {
  value: string
  onChange: (value: InputValue | ((prev: InputValue) => InputValue)) => void
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
  cursorPosition: number
  setCursorPosition: (position: number) => void
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
    cursorPosition,
    setCursorPosition,
  }: MultilineInputProps,
  forwardedRef,
) {
  const theme = useTheme()
  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const [measuredCols, setMeasuredCols] = useState<number | null>(null)
  const getEffectiveCols = useCallback(() => {
    // Prefer measured viewport columns; fallback to a conservative
    // estimate: outer width minus border(2) minus padding(2) = 4.
    const fallbackCols = Math.max(1, width - 4)
    const cols = measuredCols ?? fallbackCols
    // No extra negative fudge; use the true measured width to avoid
    // early wrap by a few characters.
    return Math.max(1, cols)
  }, [measuredCols, width])
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
    if (cursorPosition < 0) {
      setCursorPosition(0)
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
        onChange((prev) => ({
          text: newValue,
          cursorPosition: prev.cursorPosition + text.length,
          lastEditDueToNav: false,
        }))
      },
      [focused, value, cursorPosition, onChange],
    ),
  )

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    const scrollBox = scrollBoxRef.current
    if (scrollBox && focused) {
      const maxScroll = Math.max(
        0,
        scrollBox.scrollHeight - scrollBox.viewport.height,
      )
      scrollBox.verticalScrollBar.scrollPosition = maxScroll
    }
  }, [value, cursorPosition, focused])
  // Measure actual viewport width from the scrollbox to avoid
  // wrap miscalculations from heuristic padding/border math.
  useEffect(() => {
    const node = scrollBoxRef.current
    if (!node) return
    const vpWidth = Math.max(0, Math.floor(node.viewport.width || 0))
    // viewport.width already reflects inner content area; don't subtract again
    const cols = Math.max(1, vpWidth)
    setMeasuredCols(cols)
  }, [width])

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
              onChange({
                text: newValue,
                cursorPosition,
                lastEditDueToNav: false,
              })
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
        // Check if the character before cursor is a backslash for line continuation
        const hasBackslashBeforeCursor =
          cursorPosition > 0 && value[cursorPosition - 1] === '\\'

        const isPlainEnter =
          isEnterKey &&
          !key.shift &&
          !key.ctrl &&
          !key.meta &&
          !key.alt &&
          !key.option &&
          !isAltLikeModifier &&
          !hasEscapePrefix &&
          key.sequence === '\r' &&
          !hasBackslashBeforeCursor
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
        const isBackslashEnter = isEnterKey && hasBackslashBeforeCursor

        const shouldInsertNewline =
          isShiftEnter || isOptionEnter || isCtrlJ || isBackslashEnter

        if (shouldInsertNewline) {
          preventKeyDefault(key)

          // For backslash+Enter, remove the backslash and insert newline
          if (isBackslashEnter) {
            const newValue =
              value.slice(0, cursorPosition - 1) +
              '\n' +
              value.slice(cursorPosition)
            onChange({
              text: newValue,
              cursorPosition,
              lastEditDueToNav: false,
            })
            return
          }

          // For other newline shortcuts, just insert newline
          const newValue =
            value.slice(0, cursorPosition) + '\n' + value.slice(cursorPosition)
          onChange((prev) => ({
            text: newValue,
            cursorPosition: prev.cursorPosition + 1,
            lastEditDueToNav: false,
          }))
          return
        }

        if (isPlainEnter) {
          preventKeyDefault(key)
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
          preventKeyDefault(key)

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

          onChange({
            text: newValue,
            cursorPosition: nextCursor,
            lastEditDueToNav: false,
          })
          return
        }

        // Alt+Backspace or Ctrl+W: Delete word backward
        if (
          key.name === 'backspace' &&
          (isAltLikeModifier || (key.ctrl && lowerKeyName === 'w'))
        ) {
          preventKeyDefault(key)
          const newValue =
            value.slice(0, wordStart) + value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: wordStart,
            lastEditDueToNav: false,
          })
          return
        } // Cmd+Delete: Delete to line start; fallback to single delete if nothing changes
        if (key.name === 'delete' && key.meta && !isAltLikeModifier) {
          preventKeyDefault(key)

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

          onChange({
            text: newValue,
            cursorPosition: nextCursor,
            lastEditDueToNav: false,
          })
          return
        } // Alt+Delete: Delete word forward
        if (key.name === 'delete' && isAltLikeModifier) {
          preventKeyDefault(key)
          const newValue = value.slice(0, cursorPosition) + value.slice(wordEnd)
          onChange({
            text: newValue,
            cursorPosition,
            lastEditDueToNav: false,
          })
          return
        }

        // Ctrl+K: Delete to line end
        if (key.ctrl && lowerKeyName === 'k' && !key.meta && !key.option) {
          preventKeyDefault(key)
          const newValue = value.slice(0, cursorPosition) + value.slice(lineEnd)
          onChange({ text: newValue, cursorPosition, lastEditDueToNav: true })
          return
        }

        // Ctrl+H: Delete char backward (Emacs)
        if (key.ctrl && lowerKeyName === 'h' && !key.meta && !key.option) {
          preventKeyDefault(key)
          if (cursorPosition > 0) {
            const newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            onChange({
              text: newValue,
              cursorPosition: cursorPosition - 1,
              lastEditDueToNav: false,
            })
          }
          return
        }

        // Ctrl+D: Delete char forward (Emacs)
        if (key.ctrl && lowerKeyName === 'd' && !key.meta && !key.option) {
          preventKeyDefault(key)
          if (cursorPosition < value.length) {
            const newValue =
              value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
            onChange({
              text: newValue,
              cursorPosition,
              lastEditDueToNav: false,
            })
          }
          return
        }

        // Basic Backspace (no modifiers)
        if (key.name === 'backspace' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          if (cursorPosition > 0) {
            const newValue =
              value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
            onChange({
              text: newValue,
              cursorPosition: cursorPosition - 1,
              lastEditDueToNav: false,
            })
          }
          return
        }

        // Basic Delete (no modifiers)
        if (key.name === 'delete' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          if (cursorPosition < value.length) {
            const newValue =
              value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
            onChange({
              text: newValue,
              cursorPosition,
              lastEditDueToNav: false,
            })
          }
          return
        }

        // NAVIGATION SHORTCUTS

        // Alt+Left/B: Word left
        if (
          isAltLikeModifier &&
          (key.name === 'left' || lowerKeyName === 'b')
        ) {
          preventKeyDefault(key)
          setCursorPosition(wordStart)
          return
        }

        // Alt+Right/F: Word right
        if (
          isAltLikeModifier &&
          (key.name === 'right' || lowerKeyName === 'f')
        ) {
          preventKeyDefault(key)
          setCursorPosition(wordEnd)
          return
        }

        // Cmd+Left, Ctrl+A, or Home: Line start
        if (
          (key.meta && key.name === 'left' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'a' && !key.meta && !key.option) ||
          (key.name === 'home' && !key.ctrl && !key.meta)
        ) {
          preventKeyDefault(key)
          setCursorPosition(lineStart)
          return
        }

        // Cmd+Right, Ctrl+E, or End: Line end
        if (
          (key.meta && key.name === 'right' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'e' && !key.meta && !key.option) ||
          (key.name === 'end' && !key.ctrl && !key.meta)
        ) {
          preventKeyDefault(key)
          setCursorPosition(lineEnd)
          return
        }

        // Cmd+Up or Ctrl+Home: Document start
        if (
          (key.meta && key.name === 'up') ||
          (key.ctrl && key.name === 'home')
        ) {
          preventKeyDefault(key)
          setCursorPosition(0)
          return
        }

        // Cmd+Down or Ctrl+End: Document end
        if (
          (key.meta && key.name === 'down') ||
          (key.ctrl && key.name === 'end')
        ) {
          preventKeyDefault(key)
          setCursorPosition(value.length)
          return
        }

        // Ctrl+B: Backward char (Emacs)
        if (key.ctrl && lowerKeyName === 'b' && !key.meta && !key.option) {
          preventKeyDefault(key)
          setCursorPosition(Math.max(0, cursorPosition - 1))
          return
        }

        // Ctrl+F: Forward char (Emacs)
        if (key.ctrl && lowerKeyName === 'f' && !key.meta && !key.option) {
          preventKeyDefault(key)
          setCursorPosition(Math.min(value.length, cursorPosition + 1))
          return
        }

        // Left arrow (no modifiers)
        if (key.name === 'left' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          setCursorPosition(Math.max(0, cursorPosition - 1))
          return
        }

        // Right arrow (no modifiers)
        if (key.name === 'right' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          setCursorPosition(Math.min(value.length, cursorPosition + 1))
          return
        }

        // Up arrow (no modifiers)
        if (key.name === 'up' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          setCursorPosition(cursorPosition - getEffectiveCols())
        }

        // Down arrow (no modifiers)
        if (key.name === 'down' && !key.ctrl && !key.meta && !key.alt) {
          preventKeyDefault(key)
          setCursorPosition(cursorPosition + getEffectiveCols())
        }

        // Regular character input
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta &&
          !key.alt
        ) {
          preventKeyDefault(key)
          const newValue =
            value.slice(0, cursorPosition) +
            key.sequence +
            value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: cursorPosition + 1,
            lastEditDueToNav: false,
          })
          return
        }
      },
      [focused, value, cursorPosition, onChange, onSubmit, onKeyIntercept],
    ),
  )

  // Calculate display with cursor
  const isPlaceholder = value.length === 0 && placeholder.length > 0
  const displayValue = isPlaceholder ? placeholder : value
  const showCursor = focused
  const beforeCursor = showCursor ? displayValue.slice(0, cursorPosition) : ''
  const afterCursor = showCursor ? displayValue.slice(cursorPosition) : ''
  const activeChar = afterCursor.charAt(0) || ' '
  const shouldHighlight =
    showCursor && !isPlaceholder && cursorPosition < displayValue.length

  const layoutContent = showCursor
    ? shouldHighlight
      ? displayValue
      : `${displayValue.slice(0, cursorPosition)}${CURSOR_CHAR}${afterCursor}`
    : displayValue

  const cursorProbe = showCursor
    ? shouldHighlight
      ? displayValue.slice(0, cursorPosition + 1)
      : `${displayValue.slice(0, cursorPosition)}${CURSOR_CHAR}`
    : displayValue.slice(0, cursorPosition)

  const layoutMetrics = useMemo(
    () =>
      computeInputLayoutMetrics({
        layoutContent,
        cursorProbe,
        cols: getEffectiveCols(),
        maxHeight,
      }),
    [layoutContent, cursorProbe, getEffectiveCols, maxHeight],
  )

  const height = layoutMetrics.heightLines

  const shouldRenderBottomGutter = layoutMetrics.gutterEnabled

  const inputColor = isPlaceholder
    ? theme.muted
    : focused
      ? theme.inputFocusedFg
      : theme.inputFg

  const textStyle: Record<string, unknown> = {
    bg: 'transparent',
    fg: inputColor,
    attributes: isPlaceholder
      ? TextAttributes.DIM
      : textAttributes ?? TextAttributes.NONE,
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
      <text style={{ ...textStyle, wrapMode: 'char' }}>
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
              : afterCursor}
            {shouldRenderBottomGutter ? '\n' : ''}
          </>
        ) : (
          <>
            {displayValue}
            {shouldRenderBottomGutter ? '\n' : ''}
          </>
        )}
      </text>
    </scrollbox>
  )
})
