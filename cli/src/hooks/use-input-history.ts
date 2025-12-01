import { useRef, useCallback, useEffect } from 'react'

import {
  loadMessageHistory,
  saveMessageHistory,
} from '../utils/message-history'

import type { InputValue } from '../state/chat-store'
import type { InputMode } from '../utils/input-modes'

/**
 * Determine the appropriate input mode and display text for a history item.
 * Bash commands are stored with '!' prefix, so we detect that and return
 * the appropriate mode and text to display.
 */
function parseHistoryItem(item: string): {
  mode: InputMode
  displayText: string
} {
  if (item.startsWith('!') && item.length > 1) {
    // It's a bash command - strip the '!' prefix for display
    return { mode: 'bash', displayText: item.slice(1) }
  }
  // Regular prompt
  return { mode: 'default', displayText: item }
}

export const useInputHistory = (
  inputValue: string,
  setInputValue: (value: InputValue) => void,
  options?: {
    inputMode?: InputMode
    setInputMode?: (mode: InputMode) => void
  },
) => {
  const { inputMode, setInputMode } = options ?? {}
  const messageHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const currentDraftRef = useRef<string>('')
  const currentDraftModeRef = useRef<InputMode>('default')
  const isInitializedRef = useRef<boolean>(false)

  // Load history from disk on mount
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true
      const savedHistory = loadMessageHistory()
      messageHistoryRef.current = savedHistory
    }
  }, [])

  const saveToHistory = useCallback((message: string) => {
    const newHistory = [...messageHistoryRef.current, message]
    messageHistoryRef.current = newHistory
    historyIndexRef.current = -1
    currentDraftRef.current = ''
    currentDraftModeRef.current = 'default'

    // Persist to disk
    saveMessageHistory(newHistory)
  }, [])

  const navigateUp = useCallback(() => {
    const history = messageHistoryRef.current
    if (history.length === 0) return

    if (historyIndexRef.current === -1) {
      // Save current draft and mode before navigating
      currentDraftRef.current =
        inputMode === 'bash' ? '!' + inputValue : inputValue
      currentDraftModeRef.current = inputMode ?? 'default'
      historyIndexRef.current = history.length - 1
    } else if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1
    }

    const historyMessage = history[historyIndexRef.current]
    if (historyMessage === undefined) return

    const { mode, displayText } = parseHistoryItem(historyMessage)

    // Switch mode if needed
    if (setInputMode && mode !== inputMode) {
      setInputMode(mode)
    }

    setInputValue({
      text: displayText,
      cursorPosition: displayText.length,
      lastEditDueToNav: true,
    })
  }, [inputValue, inputMode, setInputValue, setInputMode])

  const navigateDown = useCallback(() => {
    const history = messageHistoryRef.current
    if (history.length === 0) return
    if (historyIndexRef.current === -1) return

    if (historyIndexRef.current < history.length - 1) {
      historyIndexRef.current += 1
      const historyMessage = history[historyIndexRef.current]
      if (historyMessage === undefined) return

      const { mode, displayText } = parseHistoryItem(historyMessage)

      // Switch mode if needed
      if (setInputMode && mode !== inputMode) {
        setInputMode(mode)
      }

      setInputValue({
        text: displayText,
        cursorPosition: displayText.length,
        lastEditDueToNav: true,
      })
    } else {
      // Return to draft
      historyIndexRef.current = -1
      const draft = currentDraftRef.current
      const draftMode = currentDraftModeRef.current

      // Restore the mode we were in when we started navigating
      if (setInputMode && draftMode !== inputMode) {
        setInputMode(draftMode)
      }

      // If draft was in bash mode, it was stored with '!' prefix, so strip it
      const textToShow =
        draftMode === 'bash' && draft.startsWith('!') ? draft.slice(1) : draft

      setInputValue({
        text: textToShow,
        cursorPosition: textToShow.length,
        lastEditDueToNav: true,
      })
    }
  }, [inputMode, setInputValue, setInputMode])

  return { saveToHistory, navigateUp, navigateDown }
}
