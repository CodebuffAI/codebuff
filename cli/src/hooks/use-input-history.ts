import { useRef, useCallback, useEffect } from 'react'

import {
  loadMessageHistory,
  saveMessageHistory,
} from '../utils/message-history'

export const useInputHistory = (
  inputValue: string,
  setInputValue: (value: string) => void,
) => {
  const messageHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const currentDraftRef = useRef<string>('')
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
    
    // Persist to disk
    saveMessageHistory(newHistory)
  }, [])

  const navigateUp = useCallback(() => {
    const history = messageHistoryRef.current
    if (history.length === 0) return

    if (historyIndexRef.current === -1) {
      currentDraftRef.current = inputValue
      historyIndexRef.current = history.length - 1
    } else if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1
    }

    const historyMessage = history[historyIndexRef.current]
    setInputValue(historyMessage)
  }, [inputValue, setInputValue])

  const navigateDown = useCallback(() => {
    const history = messageHistoryRef.current
    if (history.length === 0) return
    if (historyIndexRef.current === -1) return

    if (historyIndexRef.current < history.length - 1) {
      historyIndexRef.current += 1
      const historyMessage = history[historyIndexRef.current]
      setInputValue(historyMessage)
    } else {
      historyIndexRef.current = -1
      const draft = currentDraftRef.current
      setInputValue(draft)
    }
  }, [setInputValue])

  return { saveToHistory, navigateUp, navigateDown }
}
