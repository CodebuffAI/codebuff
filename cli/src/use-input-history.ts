import { useRef, useCallback } from 'react'
import type { InputRenderable } from '@opentui/core'

export const useInputHistory = (
  inputRenderable: InputRenderable | null,
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
    if (!inputRenderable) return
    const history = messageHistoryRef.current
    if (history.length === 0) return

    const cursor = inputRenderable.cursorPosition
    if (cursor !== 0) return

    if (historyIndexRef.current === -1) {
      currentDraftRef.current = inputValue
      historyIndexRef.current = history.length - 1
    } else if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1
    }

    const historyMessage = history[historyIndexRef.current]
    setInputValue(historyMessage)
    setTimeout(() => {
      if (inputRenderable) {
        inputRenderable.cursorPosition = historyMessage.length
      }
    }, 0)
  }, [inputRenderable, inputValue, setInputValue])

  const navigateDown = useCallback(() => {
    if (!inputRenderable) return
    const history = messageHistoryRef.current
    if (history.length === 0) return
    if (historyIndexRef.current === -1) return

    const cursor = inputRenderable.cursorPosition
    const value = inputRenderable.value
    if (cursor !== value.length) return

    if (historyIndexRef.current < history.length - 1) {
      historyIndexRef.current += 1
      const historyMessage = history[historyIndexRef.current]
      setInputValue(historyMessage)
      setTimeout(() => {
        if (inputRenderable) {
          inputRenderable.cursorPosition = historyMessage.length
        }
      }, 0)
    } else {
      historyIndexRef.current = -1
      const draft = currentDraftRef.current
      setInputValue(draft)
      setTimeout(() => {
        if (inputRenderable) {
          inputRenderable.cursorPosition = draft.length
        }
      }, 0)
    }
  }, [inputRenderable, setInputValue])

  return { saveToHistory, navigateUp, navigateDown }
}
