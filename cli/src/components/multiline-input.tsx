import { TextAttributes } from '@opentui/core'
import { useKeyboard, useRenderer } from '@opentui/react'
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
import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'
import { clamp } from '../utils/math'
import { calculateNewCursorPosition } from '../utils/word-wrap-utils'

import type { InputValue } from '../state/chat-store'
import type {
  KeyEvent,
  MouseEvent,
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

export const CURSOR_CHAR = '▍'
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/
const TAB_WIDTH = 4

// Helper to convert render position (in tab-expanded string) to original text position
function renderPositionToOriginal(text: string, renderPos: number): number {
  let originalPos = 0
  let currentRenderPos = 0

  while (originalPos < text.length && currentRenderPos < renderPos) {
    if (text[originalPos] === '\t') {
      currentRenderPos += TAB_WIDTH
    } else {
      currentRenderPos += 1
    }
    originalPos++
  }

  return Math.min(originalPos, text.length)
}

type KeyWithPreventDefault =
  | {
      preventDefault?: () => void
    }
  | null
  | undefined

function preventKeyDefault(key: KeyWithPreventDefault) {
  key?.preventDefault?.()
}

// Helper to check for alt-like modifier keys
function isAltModifier(key: KeyEvent): boolean {
  const ESC = '\x1b'
  return Boolean(
    key.option ||
      (key.sequence?.length === 2 &&
        key.sequence[0] === ESC &&
        key.sequence[1] !== '['),
  )
}

interface MultilineInputProps {
  value: string
  onChange: (value: InputValue) => void
  onSubmit: () => void
  onKeyIntercept?: (key: KeyEvent) => boolean
  onPaste: (fallbackText?: string) => void
  placeholder?: string
  focused?: boolean
  shouldBlinkCursor?: boolean
  maxHeight?: number
  minHeight?: number
  /** @deprecated This prop is no longer used but kept for backwards compatibility */
  width?: number
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
    onPaste,
    placeholder = '',
    focused = true,
    shouldBlinkCursor,
    maxHeight = 5,
    minHeight = 1,
    // width is deprecated and no longer used
    onKeyIntercept,
    cursorPosition,
  }: MultilineInputProps,
  forwardedRef,
) {
  const theme = useTheme()
  const renderer = useRenderer()
  const hookBlinkValue = useChatStore((state) => state.isFocusSupported)
  const effectiveShouldBlinkCursor = shouldBlinkCursor ?? hookBlinkValue

  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const [lastActivity, setLastActivity] = useState(Date.now())

  const stickyColumnRef = useRef<number | null>(null)

  // Helper to get or set the sticky column for vertical navigation.
  // Note: Empty dependency array is intentional - we don't want to recreate this
  // on every cursor move since it reads cursorPosition from closure only when
  // stickyColumnRef.current is null.
  const getOrSetStickyColumn = useCallback(
    (lineStarts: number[], cursorIsChar: boolean): number => {
      if (stickyColumnRef.current != null) {
        return stickyColumnRef.current
      }
      const lineIndex = lineStarts.findLastIndex(
        (lineStart) => lineStart <= cursorPosition,
      )
      const column =
        lineIndex === -1
          ? 0
          : cursorPosition - lineStarts[lineIndex] + (cursorIsChar ? -1 : 0)
      stickyColumnRef.current = Math.max(0, column)
      return stickyColumnRef.current
    },
    [],
  )

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

  // Helper to get current selection in original text coordinates
  const getSelectionRange = useCallback((): { start: number; end: number } | null => {
    const textBufferView = (textRef.current as any)?.textBufferView
    if (!textBufferView?.hasSelection?.() || !textBufferView?.getSelection) {
      return null
    }
    const selection = textBufferView.getSelection()
    if (!selection) return null

    // Convert from render positions to original text positions
    const start = renderPositionToOriginal(value, Math.min(selection.start, selection.end))
    const end = renderPositionToOriginal(value, Math.max(selection.start, selection.end))

    if (start === end) return null
    return { start, end }
  }, [value])

  // Helper to clear the current selection
  const clearSelection = useCallback(() => {
    // Use renderer's clearSelection for proper visual clearing
    ;(renderer as any)?.clearSelection?.()
  }, [renderer])

  // Helper to delete selected text and return new value and cursor position
  const deleteSelection = useCallback((): { newValue: string; newCursor: number } | null => {
    const selection = getSelectionRange()
    if (!selection) return null

    const newValue = value.slice(0, selection.start) + value.slice(selection.end)
    clearSelection()
    return { newValue, newCursor: selection.start }
  }, [value, getSelectionRange, clearSelection])

  // Helper to handle selection deletion and call onChange if selection existed
  // Returns true if selection was deleted, false otherwise
  const handleSelectionDeletion = useCallback((): boolean => {
    const deleted = deleteSelection()
    if (deleted) {
      onChange({
        text: deleted.newValue,
        cursorPosition: deleted.newCursor,
        lastEditDueToNav: false,
      })
      return true
    }
    return false
  }, [deleteSelection, onChange])

  const insertTextAtCursor = useCallback(
    (textToInsert: string) => {
      if (!textToInsert) return

      // Check if there's a selection to replace
      const selection = getSelectionRange()
      if (selection) {
        // Replace selected text with the new text
        const newValue =
          value.slice(0, selection.start) +
          textToInsert +
          value.slice(selection.end)
        clearSelection()
        onChange({
          text: newValue,
          cursorPosition: selection.start + textToInsert.length,
          lastEditDueToNav: false,
        })
        return
      }

      // No selection, insert at cursor
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
    [cursorPosition, onChange, value, getSelectionRange, clearSelection],
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

  // Handle mouse clicks to position cursor
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (!focused) return

      // Clear sticky column since this is not up/down navigation
      stickyColumnRef.current = null

      const scrollBox = scrollBoxRef.current
      if (!scrollBox) return

      const lineStarts = lineInfo?.lineStarts ?? [0]

      const viewport = (scrollBox as any).viewport
      const viewportTop = Number(viewport?.y ?? 0)
      const viewportLeft = Number(viewport?.x ?? 0)

      // Get click position, accounting for scroll
      const scrollPosition = scrollBox.verticalScrollBar?.scrollPosition ?? 0
      const clickRowInViewport = Math.floor(event.y - viewportTop)
      const clickRow = clickRowInViewport + scrollPosition

      // Find which visual line was clicked
      const lineIndex = Math.min(
        Math.max(0, clickRow),
        lineStarts.length - 1,
      )

      // Get the character range for this line
      const lineStartChar = lineStarts[lineIndex]
      const lineEndChar = lineStarts[lineIndex + 1] ?? value.length

      // Convert click x to character position, accounting for tabs
      const clickCol = Math.max(0, Math.floor(event.x - viewportLeft))

      let visualCol = 0
      let charIndex = lineStartChar

      while (charIndex < lineEndChar && visualCol < clickCol) {
        const char = value[charIndex]
        if (char === '\t') {
          visualCol += TAB_WIDTH
        } else if (char === '\n') {
          break
        } else {
          visualCol += 1
        }
        charIndex++
      }

      // Clamp to valid range
      const newCursorPosition = Math.min(charIndex, value.length)

      // Update cursor position if changed
      if (newCursorPosition !== cursorPosition) {
        onChange({
          text: value,
          cursorPosition: newCursorPosition,
          lastEditDueToNav: false,
        })
      }
    },
    [focused, lineInfo, value, cursorPosition, onChange],
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

  // --- Keyboard Handler Helpers ---

  // Handle enter/newline keys
  const handleEnterKeys = useCallback(
    (key: KeyEvent): boolean => {
      const isEnterKey = key.name === 'return' || key.name === 'enter'
      if (!isEnterKey) return false

      const lowerKeyName = (key.name ?? '').toLowerCase()
      const isAltLikeModifier = isAltModifier(key)
      const hasEscapePrefix =
        typeof key.sequence === 'string' &&
        key.sequence.length > 0 &&
        key.sequence.charCodeAt(0) === 0x1b
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
          return true
        }

        // For other newline shortcuts, just insert newline
        const newValue =
          value.slice(0, cursorPosition) + '\n' + value.slice(cursorPosition)
        onChange({
          text: newValue,
          cursorPosition: cursorPosition + 1,
          lastEditDueToNav: false,
        })
        return true
      }

      if (isPlainEnter) {
        preventKeyDefault(key)
        onSubmit()
        return true
      }

      return false
    },
    [value, cursorPosition, onChange, onSubmit],
  )

  // Handle deletion keys (backspace, delete, ctrl+h, ctrl+d, word/line deletion)
  const handleDeletionKeys = useCallback(
    (key: KeyEvent): boolean => {
      const lowerKeyName = (key.name ?? '').toLowerCase()
      const isAltLikeModifier = isAltModifier(key)
      const lineStart = findLineStart(value, cursorPosition)
      const lineEnd = findLineEnd(value, cursorPosition)
      const wordStart = findPreviousWordBoundary(value, cursorPosition)
      const wordEnd = findNextWordBoundary(value, cursorPosition)

      // Ctrl+U: Delete from cursor to beginning of current VISUAL line
      if (key.ctrl && lowerKeyName === 'u' && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        const visualLineStart = lineInfo?.lineStarts?.[cursorRow] ?? lineStart

        logger.debug('Ctrl+U:', {
          cursorPosition,
          cursorRow,
          visualLineStart,
          oldLineStart: lineStart,
          lineStarts: lineInfo?.lineStarts,
        })

        if (cursorPosition > visualLineStart) {
          const newValue =
            value.slice(0, visualLineStart) + value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: visualLineStart,
            lastEditDueToNav: false,
          })
        } else if (cursorPosition > 0) {
          const newValue =
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: cursorPosition - 1,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      // Alt+Backspace or Ctrl+W: Delete word backward
      if (
        (key.name === 'backspace' && isAltLikeModifier) ||
        (key.ctrl && lowerKeyName === 'w')
      ) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        const newValue =
          value.slice(0, wordStart) + value.slice(cursorPosition)
        onChange({
          text: newValue,
          cursorPosition: wordStart,
          lastEditDueToNav: false,
        })
        return true
      }

      // Cmd+Delete: Delete to line start
      if (key.name === 'delete' && key.meta && !isAltLikeModifier) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
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

        if (newValue !== originalValue) {
          onChange({
            text: newValue,
            cursorPosition: nextCursor,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      // Alt+Delete: Delete word forward
      if (key.name === 'delete' && isAltLikeModifier) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        const newValue = value.slice(0, cursorPosition) + value.slice(wordEnd)
        onChange({
          text: newValue,
          cursorPosition,
          lastEditDueToNav: false,
        })
        return true
      }

      // Ctrl+K: Delete to line end
      if (key.ctrl && lowerKeyName === 'k' && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        const newValue = value.slice(0, cursorPosition) + value.slice(lineEnd)
        onChange({ text: newValue, cursorPosition, lastEditDueToNav: true })
        return true
      }

      // Ctrl+H: Delete char backward (Emacs)
      if (key.ctrl && lowerKeyName === 'h' && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        if (cursorPosition > 0) {
          const newValue =
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: cursorPosition - 1,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      // Ctrl+D: Delete char forward (Emacs)
      if (key.ctrl && lowerKeyName === 'd' && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        if (cursorPosition < value.length) {
          const newValue =
            value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
          onChange({
            text: newValue,
            cursorPosition,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      // Basic Backspace (no modifiers)
      if (key.name === 'backspace' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        if (cursorPosition > 0) {
          const newValue =
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          onChange({
            text: newValue,
            cursorPosition: cursorPosition - 1,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      // Basic Delete (no modifiers)
      if (key.name === 'delete' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        if (handleSelectionDeletion()) return true
        if (cursorPosition < value.length) {
          const newValue =
            value.slice(0, cursorPosition) + value.slice(cursorPosition + 1)
          onChange({
            text: newValue,
            cursorPosition,
            lastEditDueToNav: false,
          })
        }
        return true
      }

      return false
    },
    [value, cursorPosition, onChange, lineInfo, cursorRow, handleSelectionDeletion],
  )

  // Handle navigation keys (arrows, home, end, word navigation, emacs bindings)
  const handleNavigationKeys = useCallback(
    (key: KeyEvent): boolean => {
      const lowerKeyName = (key.name ?? '').toLowerCase()
      const isAltLikeModifier = isAltModifier(key)
      const lineStart = findLineStart(value, cursorPosition)
      const lineEnd = findLineEnd(value, cursorPosition)
      const wordStart = findPreviousWordBoundary(value, cursorPosition)
      const wordEnd = findNextWordBoundary(value, cursorPosition)

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
        return true
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
        return true
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
        return true
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
        return true
      }

      // Cmd+Up or Ctrl+Home: Document start
      if (
        (key.meta && key.name === 'up') ||
        (key.ctrl && key.name === 'home')
      ) {
        preventKeyDefault(key)
        onChange({ text: value, cursorPosition: 0, lastEditDueToNav: false })
        return true
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
        return true
      }

      // Ctrl+B: Backward char (Emacs)
      if (key.ctrl && lowerKeyName === 'b' && !key.meta && !key.option) {
        preventKeyDefault(key)
        onChange({
          text: value,
          cursorPosition: cursorPosition - 1,
          lastEditDueToNav: false,
        })
        return true
      }

      // Ctrl+F: Forward char (Emacs)
      if (key.ctrl && lowerKeyName === 'f' && !key.meta && !key.option) {
        preventKeyDefault(key)
        onChange({
          text: value,
          cursorPosition: Math.min(value.length, cursorPosition + 1),
          lastEditDueToNav: false,
        })
        return true
      }

      // Left arrow (no modifiers)
      if (key.name === 'left' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        moveCursor(cursorPosition - 1)
        return true
      }

      // Right arrow (no modifiers)
      if (key.name === 'right' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        moveCursor(cursorPosition + 1)
        return true
      }

      // Up arrow (no modifiers)
      if (key.name === 'up' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        const lineStarts = lineInfo?.lineStarts ?? []
        const desiredIndex = getOrSetStickyColumn(lineStarts, !shouldHighlight)
        onChange({
          text: value,
          cursorPosition: calculateNewCursorPosition({
            cursorPosition,
            lineStarts,
            cursorIsChar: !shouldHighlight,
            direction: 'up',
            desiredIndex,
          }),
          lastEditDueToNav: false,
        })
        return true
      }

      // Down arrow (no modifiers)
      if (key.name === 'down' && !key.ctrl && !key.meta && !key.option) {
        preventKeyDefault(key)
        const lineStarts = lineInfo?.lineStarts ?? []
        const desiredIndex = getOrSetStickyColumn(lineStarts, !shouldHighlight)
        onChange({
          text: value,
          cursorPosition: calculateNewCursorPosition({
            cursorPosition,
            lineStarts,
            cursorIsChar: !shouldHighlight,
            direction: 'down',
            desiredIndex,
          }),
          lastEditDueToNav: false,
        })
        return true
      }

      return false
    },
    [value, cursorPosition, onChange, moveCursor, lineInfo, shouldHighlight, getOrSetStickyColumn],
  )

  // Handle character input (regular chars and tab)
  const handleCharacterInput = useCallback(
    (key: KeyEvent): boolean => {
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
        return true
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
        return true
      }

      return false
    },
    [insertTextAtCursor],
  )

  // Main keyboard handler - delegates to specialized handlers
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!focused) return

        if (onKeyIntercept) {
          const handled = onKeyIntercept(key)
          if (handled) return
        }

        // Clear sticky column for non-vertical navigation
        const isVerticalNavKey = key.name === 'up' || key.name === 'down'
        if (!isVerticalNavKey) {
          stickyColumnRef.current = null
        }

        // Delegate to specialized handlers
        if (handleEnterKeys(key)) return
        if (handleDeletionKeys(key)) return
        if (handleNavigationKeys(key)) return
        if (handleCharacterInput(key)) return
      },
      [
        focused,
        onKeyIntercept,
        handleEnterKeys,
        handleDeletionKeys,
        handleNavigationKeys,
        handleCharacterInput,
      ],
    ),
  )

  const layoutMetrics = (() => {
    const safeMaxHeight = Math.max(1, maxHeight)
    const effectiveMinHeight = Math.max(1, Math.min(minHeight, safeMaxHeight))

    const totalLines =
      lineInfo === null ? 0 : lineInfo.lineStarts.length

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

  // Use theme's info color for selection highlight background
  const highlightBg = theme.info

  return (
    <scrollbox
      ref={scrollBoxRef}
      scrollX={false}
      stickyScroll={true}
      stickyStart="bottom"
      scrollbarOptions={{ visible: false }}
      onPaste={(event) => onPaste(event.text)}
      onMouseDown={handleMouseDown}
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
                shouldBlink={effectiveShouldBlinkCursor}
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
