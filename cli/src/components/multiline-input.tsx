import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { InputCursor } from './input-cursor'
import { useTheme } from '../hooks/use-theme'
import { clamp } from '../utils/math'
import { logger } from '../utils/logger'
import { calculateNewCursorPosition } from '../utils/word-wrap-utils'

import type { InputValue } from '../state/chat-store'
import type {
  KeyEvent,
  PasteEvent,
  ScrollBoxRenderable,
  TextBufferView,
  TextRenderable,
} from '@opentui/core'

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
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/
const TAB_WIDTH = 4

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
  onChange: (value: InputValue) => void
  onSubmit: () => void
  onKeyIntercept?: (key: KeyEvent) => boolean
  placeholder?: string
  focused?: boolean
  maxHeight?: number
  minHeight?: number
  width: number
  textAttributes?: number
  cursorPosition: number
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
    minHeight = 1,
    width,
    textAttributes,
    onKeyIntercept,
    cursorPosition,
  }: MultilineInputProps,
  forwardedRef,
) {
  const theme = useTheme()
  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const [measuredCols, setMeasuredCols] = useState<number | null>(null)
  const [lastActivity, setLastActivity] = useState(Date.now())

  // Update last activity on value or cursor changes
  useEffect(() => {
    setLastActivity(Date.now())
  }, [value, cursorPosition])

  const textRef = useRef<TextRenderable | null>(null)

  const lineInfo = textRef.current
    ? (
        (textRef.current satisfies TextRenderable as any)
          .textBufferView as TextBufferView
      ).lineInfo
    : null

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

  const handlePaste = useCallback(
    (event: PasteEvent) => {
      if (!focused) return

      const text = event.text ?? ''
      if (!text) return

      const newValue =
        value.slice(0, cursorPosition) + text + value.slice(cursorPosition)
      onChange({
        text: newValue,
        cursorPosition: cursorPosition + text.length,
        lastEditDueToNav: false,
      })
    },
    [focused, value, cursorPosition, onChange],
  )

  const cursorRow = lineInfo
    ? Math.max(
        0,
        lineInfo.lineStarts.findLastIndex(
          (lineStart) => lineStart <= cursorPosition,
        ),
      )
    : 0

  // Auto-scroll to cursor when content changes
  useEffect(() => {
    const scrollBox = scrollBoxRef.current
    if (scrollBox && focused) {
      const scrollPosition = clamp(
        scrollBox.verticalScrollBar.scrollPosition,
        Math.max(0, cursorRow - scrollBox.viewport.height + 1),
        Math.min(scrollBox.scrollHeight - scrollBox.viewport.height, cursorRow),
      )

      scrollBox.verticalScrollBar.scrollPosition = scrollPosition
    }
  }, [scrollBoxRef.current, cursorPosition, focused, cursorRow])

  // Measure actual viewport width from the scrollbox to avoid
  // wrap miscalculations from heuristic padding/border math.
  useEffect(() => {
    const node = scrollBoxRef.current
    if (!node) return
    const viewportWidth = Number(node.viewport?.width ?? 0)
    if (!Number.isFinite(viewportWidth)) return
    const vpWidth = Math.floor(viewportWidth)
    if (vpWidth <= 0) return
    // viewport.width already reflects inner content area; don't subtract again
    const cols = Math.max(1, vpWidth)
    setMeasuredCols(cols)
  }, [scrollBoxRef.current, scrollBoxRef.current?.viewport?.width, width])

  const insertTextAtCursor = useCallback(
    (textToInsert: string) => {
      if (!textToInsert) return
      const newValue =
        value.slice(0, cursorPosition) +
        textToInsert +
        value.slice(cursorPosition)
      onChange({
        text: newValue,
        cursorPosition: cursorPosition + textToInsert.length,
        lastEditDueToNav: false,
      })
    },
    [cursorPosition, onChange, value],
  )

  const moveCursor = useCallback(
    (nextPosition: number) => {
      const clamped = Math.max(0, Math.min(value.length, nextPosition))
      if (clamped === cursorPosition) return
      onChange({
        text: value,
        cursorPosition: clamped,
        lastEditDueToNav: false,
      })
    },
    [cursorPosition, onChange, value],
  )

  const isPlaceholder = value.length === 0 && placeholder.length > 0
  const displayValue = isPlaceholder ? placeholder : value
  const showCursor = focused

  // Replace tabs with spaces for proper rendering
  const displayValueForRendering = displayValue.replace(
    /\t/g,
    ' '.repeat(TAB_WIDTH),
  )

  // Calculate cursor position in the expanded string (accounting for tabs)
  let renderCursorPosition = 0
  for (let i = 0; i < cursorPosition && i < displayValue.length; i++) {
    renderCursorPosition += displayValue[i] === '\t' ? TAB_WIDTH : 1
  }

  const { beforeCursor, afterCursor, activeChar, shouldHighlight } = (() => {
    if (!showCursor) {
      return {
        beforeCursor: '',
        afterCursor: '',
        activeChar: ' ',
        shouldHighlight: false,
      }
    }

    const beforeCursor = displayValueForRendering.slice(0, renderCursorPosition)
    const afterCursor = displayValueForRendering.slice(renderCursorPosition)
    const activeChar = afterCursor.charAt(0) || ' '
    const shouldHighlight =
      !isPlaceholder &&
      renderCursorPosition < displayValueForRendering.length &&
      displayValue[cursorPosition] !== '\n' &&
      displayValue[cursorPosition] !== '\t'

    return {
      beforeCursor,
      afterCursor,
      activeChar,
      shouldHighlight,
    }
  })()

  // Handle all keyboard input with advanced shortcuts
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!focused) return

        if (onKeyIntercept) {
          const handled = onKeyIntercept(key)
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
          onChange({
            text: newValue,
            cursorPosition: cursorPosition + 1,
            lastEditDueToNav: false,
          })
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

        // Ctrl+U: Delete from cursor to beginning of current VISUAL line (accounting for word-wrap)
        // If at line start, act like backspace (delete to join with previous line)
        if (key.ctrl && lowerKeyName === 'u' && !key.meta && !key.option) {
          preventKeyDefault(key)

          // Use lineInfo.lineStarts which includes both newlines AND word-wrap positions
          const visualLineStart = lineInfo?.lineStarts?.[cursorRow] ?? lineStart

          logger.debug('Ctrl+U:', {
            cursorPosition,
            cursorRow,
            visualLineStart,
            oldLineStart: lineStart,
            lineStarts: lineInfo?.lineStarts,
          })

          if (cursorPosition > visualLineStart) {
            // Delete from visual line start to cursor
            const newValue =
              value.slice(0, visualLineStart) + value.slice(cursorPosition)
            onChange({
              text: newValue,
              cursorPosition: visualLineStart,
              lastEditDueToNav: false,
            })
          } else if (cursorPosition > 0) {
            // At line start: delete one character backward (backspace behavior)
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

        // Alt+Backspace or Ctrl+W: Delete word backward
        if (
          (key.name === 'backspace' && isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'w')
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
        if (key.name === 'backspace' && !key.ctrl && !key.meta && !key.option) {
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
        if (key.name === 'delete' && !key.ctrl && !key.meta && !key.option) {
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
          onChange({
            text: value,
            cursorPosition: wordStart,
            lastEditDueToNav: false,
          })
          return
        }

        // Alt+Right/F: Word right
        if (
          isAltLikeModifier &&
          (key.name === 'right' || lowerKeyName === 'f')
        ) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: wordEnd,
            lastEditDueToNav: false,
          })
          return
        }

        // Cmd+Left, Ctrl+A, or Home: Line start
        if (
          (key.meta && key.name === 'left' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'a' && !key.meta && !key.option) ||
          (key.name === 'home' && !key.ctrl && !key.meta)
        ) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: lineStart,
            lastEditDueToNav: false,
          })
          return
        }

        // Cmd+Right, Ctrl+E, or End: Line end
        if (
          (key.meta && key.name === 'right' && !isAltLikeModifier) ||
          (key.ctrl && lowerKeyName === 'e' && !key.meta && !key.option) ||
          (key.name === 'end' && !key.ctrl && !key.meta)
        ) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: lineEnd,
            lastEditDueToNav: false,
          })
          return
        }

        // Cmd+Up or Ctrl+Home: Document start
        if (
          (key.meta && key.name === 'up') ||
          (key.ctrl && key.name === 'home')
        ) {
          preventKeyDefault(key)
          onChange({ text: value, cursorPosition: 0, lastEditDueToNav: false })
          return
        }

        // Cmd+Down or Ctrl+End: Document end
        if (
          (key.meta && key.name === 'down') ||
          (key.ctrl && key.name === 'end')
        ) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: value.length,
            lastEditDueToNav: false,
          })
          return
        }

        // Ctrl+B: Backward char (Emacs)
        if (key.ctrl && lowerKeyName === 'b' && !key.meta && !key.option) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: cursorPosition - 1,
            lastEditDueToNav: false,
          })
          return
        }

        // Ctrl+F: Forward char (Emacs)
        if (key.ctrl && lowerKeyName === 'f' && !key.meta && !key.option) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: Math.min(value.length, cursorPosition + 1),
            lastEditDueToNav: false,
          })
          return
        }

        // Left arrow (no modifiers)
        if (key.name === 'left' && !key.ctrl && !key.meta && !key.option) {
          preventKeyDefault(key)
          moveCursor(cursorPosition - 1)
          return
        }

        // Right arrow (no modifiers)
        if (key.name === 'right' && !key.ctrl && !key.meta && !key.option) {
          preventKeyDefault(key)
          moveCursor(cursorPosition + 1)
          return
        }

        // Up arrow (no modifiers)
        if (key.name === 'up' && !key.ctrl && !key.meta && !key.option) {
          preventKeyDefault(key)
          onChange({
            text: value,
            cursorPosition: calculateNewCursorPosition({
              cursorPosition,
              lineStarts: lineInfo?.lineStarts ?? [],
              cursorIsChar: !shouldHighlight,
              direction: 'up',
            }),
            lastEditDueToNav: false,
          })
          return
        }

        // Down arrow (no modifiers)
        if (key.name === 'down' && !key.ctrl && !key.meta && !key.option) {
          onChange({
            text: value,
            cursorPosition: calculateNewCursorPosition({
              cursorPosition,
              lineStarts: lineInfo?.lineStarts ?? [],
              cursorIsChar: !shouldHighlight,
              direction: 'down',
            }),
            lastEditDueToNav: false,
          })
          return
        }

        // Tab: insert literal tab when no modifiers are held
        if (
          key.name === 'tab' &&
          key.sequence &&
          !key.shift &&
          !key.ctrl &&
          !key.meta &&
          !key.option
        ) {
          preventKeyDefault(key)
          insertTextAtCursor('\t')
          return
        }

        // Regular character input
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta &&
          !key.option &&
          !CONTROL_CHAR_REGEX.test(key.sequence)
        ) {
          preventKeyDefault(key)
          insertTextAtCursor(key.sequence)
          return
        }
      },
      [
        focused,
        value,
        cursorPosition,
        shouldHighlight,
        lineInfo,
        onChange,
        onSubmit,
        onKeyIntercept,
        insertTextAtCursor,
        moveCursor,
      ],
    ),
  )

  const layoutMetrics = (() => {
    const safeMaxHeight = Math.max(1, maxHeight)
    const effectiveMinHeight = Math.max(1, Math.min(minHeight, safeMaxHeight))

    const totalLines =
      measuredCols === 0 || lineInfo === null ? 0 : lineInfo.lineStarts.length

    // Add bottom gutter when cursor is on line 2 of exactly 2 lines
    const gutterEnabled =
      totalLines === 2 && cursorRow === 1 && totalLines + 1 <= safeMaxHeight

    const rawHeight = Math.min(
      totalLines + (gutterEnabled ? 1 : 0),
      safeMaxHeight,
    )

    const heightLines = Math.max(effectiveMinHeight, rawHeight)

    return {
      heightLines,
      gutterEnabled,
    }
  })()

  const inputColor = isPlaceholder
    ? theme.muted
    : focused
      ? theme.inputFocusedFg
      : theme.inputFg

  const highlightBg = '#7dd3fc' // Lighter blue for highlight background

  return (
    <scrollbox
      ref={scrollBoxRef}
      scrollX={false}
      stickyScroll={true}
      stickyStart="bottom"
      scrollbarOptions={{ visible: false }}
      onPaste={handlePaste}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        rootOptions: {
          width: '100%',
          height: layoutMetrics.heightLines,
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
          justifyContent: 'flex-start',
        },
      }}
    >
      <text
        ref={textRef}
        style={{ bg: 'transparent', fg: inputColor, wrapMode: 'word' }}
      >
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
              <InputCursor
                visible={true}
                focused={focused}
                color={theme.info}
                key={lastActivity}
              />
            )}
            {shouldHighlight
              ? afterCursor.length > 0
                ? afterCursor.slice(1)
                : ''
              : afterCursor}
            {layoutMetrics.gutterEnabled ? '\n' : ''}
          </>
        ) : (
          <>
            {displayValueForRendering}
            {layoutMetrics.gutterEnabled ? '\n' : ''}
          </>
        )}
      </text>
    </scrollbox>
  )
})
