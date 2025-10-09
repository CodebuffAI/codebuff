import { useRef, useCallback } from 'react'

export const useInputHistory = (
  inputValue: string,
  setInputValue: (value: string) => void,
) => {
  const messageHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const currentDraftRef = useRef<string>('')

  const saveToHistory = useCallback((message: string) => {
    messageHistoryRef.current = [...messageHistoryRef.current, message]
    historyIndexRef.current = -1
    currentDraftRef.current = ''
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
