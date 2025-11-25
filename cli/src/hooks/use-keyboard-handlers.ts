import { useKeyboard } from '@opentui/react'
import { useCallback } from 'react'

import { useChatStore } from '../state/chat-store'

type InputHandle = { focus: () => void }

interface KeyboardHandlersConfig {
  isStreaming: boolean
  isWaitingForResponse: boolean
  abortControllerRef: React.MutableRefObject<AbortController | null>
  focusedAgentId: string | null
  setFocusedAgentId: (id: string | null) => void
  setInputFocused: (focused: boolean) => void
  inputRef: React.MutableRefObject<InputHandle | null>
  navigateUp: () => void
  navigateDown: () => void
  toggleAgentMode: () => void
  onCtrlC: () => boolean
  onInterrupt: () => void
  historyNavUpEnabled: boolean
  historyNavDownEnabled: boolean
  disabled?: boolean
  inputValue: string
  setInputValue: (value: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => void
}

export const useKeyboardHandlers = ({
  isStreaming,
  isWaitingForResponse,
  abortControllerRef,
  focusedAgentId,
  setFocusedAgentId,
  setInputFocused,
  inputRef,
  navigateUp,
  navigateDown,
  toggleAgentMode,
  onCtrlC,
  onInterrupt,
  historyNavUpEnabled,
  historyNavDownEnabled,
  disabled = false,
  inputValue,
  setInputValue,
}: KeyboardHandlersConfig) => {
  useKeyboard(
    useCallback(
      (key) => {
        if (disabled) return

        const isEscape = key.name === 'escape'
        const isCtrlC = key.ctrl && key.name === 'c'

        // Handle escape with input: clear input first
        if (isEscape && !isStreaming && !isWaitingForResponse && inputValue.trim()) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
          setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
          return
        }

        // Handle escape with empty input: exit current mode if not default
        if (isEscape && !isStreaming && !isWaitingForResponse && !inputValue.trim()) {
          const { inputMode, setInputMode } = useChatStore.getState()
          if (inputMode !== 'default') {
            if (
              'preventDefault' in key &&
              typeof key.preventDefault === 'function'
            ) {
              key.preventDefault()
            }
            setInputMode('default')
            return
          }
        }

        if ((isEscape || isCtrlC) && (isStreaming || isWaitingForResponse)) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          if (abortControllerRef.current) {
            abortControllerRef.current.abort()
          }
          onInterrupt()

          return
        }

        if (isCtrlC) {
          const shouldPrevent = onCtrlC()
          if (
            shouldPrevent &&
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
        }
      },
      [
        isStreaming,
        isWaitingForResponse,
        abortControllerRef,
        onCtrlC,
        onInterrupt,
        disabled,
        inputValue,
        setInputValue,
      ],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (disabled) return
        if (!focusedAgentId) return

        const isSpace =
          key.name === 'space' && !key.ctrl && !key.meta && !key.shift
        const isEnter =
          (key.name === 'return' || key.name === 'enter') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift
        const isRightArrow =
          key.name === 'right' && !key.ctrl && !key.meta && !key.shift
        const isLeftArrow =
          key.name === 'left' && !key.ctrl && !key.meta && !key.shift

        if (!isSpace && !isEnter && !isRightArrow && !isLeftArrow) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }
        return
      },
      [focusedAgentId, disabled],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (disabled) return
        if (key.name === 'escape' && focusedAgentId) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
          setFocusedAgentId(null)
          setInputFocused(true)
          inputRef.current?.focus()
        }
      },
      [focusedAgentId, setFocusedAgentId, setInputFocused, inputRef, disabled],
    ),
  )

  // Handle chat history navigation
  useKeyboard(
    useCallback(
      (key) => {
        if (disabled) return

        const isUpArrow =
          key.name === 'up' && !key.ctrl && !key.meta && !key.shift
        const isDownArrow =
          key.name === 'down' && !key.ctrl && !key.meta && !key.shift

        if (!isUpArrow && !isDownArrow) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }

        if (isUpArrow) {
          if (!historyNavUpEnabled) return
          navigateUp()
        } else {
          if (!historyNavDownEnabled) return
          navigateDown()
        }
      },
      [
        historyNavUpEnabled,
        historyNavDownEnabled,
        navigateUp,
        navigateDown,
        disabled,
      ],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (disabled) return

        const isShiftTab =
          key.shift && key.name === 'tab' && !key.ctrl && !key.meta

        if (!isShiftTab) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }

        toggleAgentMode()
      },
      [toggleAgentMode, disabled],
    ),
  )
}
