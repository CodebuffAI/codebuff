import { useEffect } from 'react'
import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'

export function useAskUserBridge() {
  const setAskUserState = useChatStore((state) => state.setAskUserState)

  useEffect(() => {
    const unsubscribe = AskUserBridge.subscribe((request) => {
      logger.info({ request }, 'AskUserBridge subscription received request')
      if (request) {
        setAskUserState({
          toolCallId: request.toolCallId,
          questions: request.questions,
          selectedAnswers: new Array(request.questions.length).fill(-1),
          otherTexts: new Array(request.questions.length).fill(''),
        })
      } else {
        setAskUserState(null)
      }
    })
    return unsubscribe
  }, [setAskUserState])

  const submitAnswers = (answers: Array<{ questionIndex: number; selectedOption?: string; otherText?: string }>) => {
    logger.info({ answers }, '[useAskUserBridge] submitAnswers called')
    AskUserBridge.submit({ answers })
  }

  const skip = () => {
    logger.info('[useAskUserBridge] skip called')
    AskUserBridge.submit({ skipped: true })
  }

  return { submitAnswers, skip }
}
