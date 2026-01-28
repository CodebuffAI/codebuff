import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import { useEffect } from 'react'

import { useChatStore } from '../state/chat-store'

import type { AskUserQuestion } from '../types/store'

/**
 * Patterns that indicate a "custom" or "other" catch-all option.
 * These are redundant since the UI automatically provides a Custom text input.
 */
const REDUNDANT_OPTION_PATTERNS = [
  /^custom$/i,
  /^other$/i,
  /^none\s*(of\s*the\s*above)?$/i,
  /^something\s*else$/i,
  /^enter\s*(my\s*)?own$/i,
  /^type\s*(my\s*)?own$/i,
  /^write\s*(my\s*)?own$/i,
]

/**
 * Gets the label from an option, handling both string and object formats.
 */
function getOptionLabel(option: string | { label: string; description?: string }): string {
  return typeof option === 'string' ? option : option.label
}

/**
 * Checks if an option label matches any of the redundant "custom/other" patterns.
 */
function isRedundantOption(option: string | { label: string; description?: string }): boolean {
  const label = getOptionLabel(option).trim()
  return REDUNDANT_OPTION_PATTERNS.some((pattern) => pattern.test(label))
}

/**
 * Filters out redundant "Custom"/"Other" options from questions.
 * The UI already provides a Custom text input, so these are unnecessary and confusing.
 */
function filterRedundantOptions(questions: AskUserQuestion[]): AskUserQuestion[] {
  return questions.map((question) => {
    const filteredOptions = question.options.filter((option) => !isRedundantOption(option))
    return {
      ...question,
      // Preserve the original array type (string[] or object[])
      options: filteredOptions as typeof question.options,
    }
  })
}

export function useAskUserBridge() {
  const setAskUserState = useChatStore((state) => state.setAskUserState)

  useEffect(() => {
    const unsubscribe = AskUserBridge.subscribe((request) => {
      if (request) {
        // Filter out redundant "Custom"/"Other" options since UI provides its own
        const filteredQuestions = filterRedundantOptions(request.questions)
        setAskUserState({
          toolCallId: request.toolCallId,
          questions: filteredQuestions,
          // Initialize based on question type: multi-select → [], single-select → -1
          selectedAnswers: filteredQuestions.map((q) => (q.multiSelect ? [] : -1)),
          otherTexts: new Array(filteredQuestions.length).fill(''),
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
