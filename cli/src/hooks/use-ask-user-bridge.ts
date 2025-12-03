import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import { useEffect } from 'react'

import { useChatStore } from '../state/chat-store'

export function useAskUserBridge() {
  const setAskUserState = useChatStore((state) => state.setAskUserState)
  const setInputValue = useChatStore((state) => state.setInputValue)

  useEffect(() => {
    const unsubscribe = AskUserBridge.subscribe((request) => {
      if (request) {
        setAskUserState({
          toolCallId: request.toolCallId,
          questions: request.questions,
          // Initialize based on question type: multi-select → [], single-select → -1
          selectedAnswers: request.questions.map((q) => (q.multiSelect ? [] : -1)),
          otherTexts: new Array(request.questions.length).fill(''),
        })
      } else {
        setAskUserState(null)
      }
    })
    return unsubscribe
  }, [setAskUserState])

  const submitAnswers = (
    answers: Array<{
      questionIndex: number
      selectedOption?: string
      selectedOptions?: string[]
      otherText?: string
    }>
  ) => {
    // Clear input value so previous prompt doesn't appear after form closes
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    AskUserBridge.submit({ answers })
  }

  const skip = () => {
    // Clear input value so previous prompt doesn't appear after form closes
    setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    AskUserBridge.submit({ skipped: true })
  }

  return { submitAnswers, skip }
}
