import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import { useEffect } from 'react'

import { useChatStore } from '../state/chat-store'

export function useAskUserBridge() {
  const setAskUserState = useChatStore((state) => state.setAskUserState)

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
    // Don't clear input value - preserve user's input from before the questionnaire
    AskUserBridge.submit({ answers })
  }

  const skip = () => {
    // Don't clear input value - preserve user's input from before the questionnaire
    AskUserBridge.submit({ skipped: true })
  }

  return { submitAnswers, skip }
}
