import { useKeyboard } from '@opentui/react'
import { useCallback } from 'react'

import type { KeyEvent } from '@opentui/core'

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
}

const preventDefault = (key: KeyEvent) => {
  if ('preventDefault' in key && typeof key.preventDefault === 'function') {
    key.preventDefault()
  }
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
}: KeyboardHandlersConfig) => {
  const handleKeyboard = useCallback(
    (key: KeyEvent) => {
      if (disabled) return

      const isEscape = key.name === 'escape'
      const isCtrlC = key.ctrl && key.name === 'c'
      const isUpArrow = key.name === 'up' && !key.ctrl && !key.meta && !key.shift
      const isDownArrow = key.name === 'down' && !key.ctrl && !key.meta && !key.shift
      const isShiftTab = key.shift && key.name === 'tab' && !key.ctrl && !key.meta
      const isSpace = key.name === 'space' && !key.ctrl && !key.meta && !key.shift
      const isEnter = (key.name === 'return' || key.name === 'enter') && !key.ctrl && !key.meta && !key.shift
      const isRightArrow = key.name === 'right' && !key.ctrl && !key.meta && !key.shift
      const isLeftArrow = key.name === 'left' && !key.ctrl && !key.meta && !key.shift

      // Handle escape/ctrl+c during streaming
      if ((isEscape || isCtrlC) && (isStreaming || isWaitingForResponse)) {
        preventDefault(key)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        onInterrupt()
        return
      }

      // Handle ctrl+c for exit
      if (isCtrlC) {
        const shouldPrevent = onCtrlC()
        if (shouldPrevent) {
          preventDefault(key)
        }
        return
      }

      // Handle escape to unfocus agent
      if (isEscape && focusedAgentId) {
        preventDefault(key)
        setFocusedAgentId(null)
        setInputFocused(true)
        inputRef.current?.focus()
        return
      }

      // Prevent default actions when agent is focused
      if (focusedAgentId && (isSpace || isEnter || isRightArrow || isLeftArrow)) {
        preventDefault(key)
        return
      }

      // Handle history navigation (up/down arrows)
      if (isUpArrow) {
        if (historyNavUpEnabled) {
          preventDefault(key)
          navigateUp()
        }
        return
      }

      if (isDownArrow) {
        if (historyNavDownEnabled) {
          preventDefault(key)
          navigateDown()
        }
        return
      }

      // Handle shift+tab for mode toggle
      if (isShiftTab) {
        preventDefault(key)
        toggleAgentMode()
        return
      }
    },
    [
      disabled,
      isStreaming,
      isWaitingForResponse,
      abortControllerRef,
      onInterrupt,
      onCtrlC,
      focusedAgentId,
      setFocusedAgentId,
      setInputFocused,
      inputRef,
      historyNavUpEnabled,
      historyNavDownEnabled,
      navigateUp,
      navigateDown,
      toggleAgentMode,
    ],
  )

  useKeyboard(handleKeyboard)
}
