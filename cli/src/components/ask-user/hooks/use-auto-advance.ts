/**
 * Hook for auto-advancing through questions after selection
 * Consolidates duplicated logic from keyboard and mouse handlers
 */

import { useCallback, useRef } from 'react'

import { ASK_USER_CONFIG } from '../constants'
import { areAllQuestionsAnswered } from '../types'
import { shouldAutoAdvance } from '../utils/navigation-handlers'

import type { AnswerState, AskUserQuestion } from '../types'

/**
 * Configuration for auto-advance behavior
 */
export interface AutoAdvanceConfig {
  isLastQuestion: boolean
  currentQuestionIndex: number
  currentQuestion: AskUserQuestion
  selectedAnswers: AnswerState[]
  otherTexts: string[]
  delayMs?: number
  onSubmit: (answers?: AnswerState[], otherTexts?: string[]) => void
  onAdvanceQuestion: () => void
}

/**
 * Hook for handling auto-advance after selection
 */
export function useAutoAdvance(config: AutoAdvanceConfig) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clean up timeout on unmount
  const clearAdvanceTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  /**
   * Handle selection with auto-advance logic
   */
  const handleSelection = useCallback(
    (newAnswer: number | number[], updatedOtherTexts?: string[]) => {
      // Clear any pending timeout
      clearAdvanceTimeout()

      // Check if we should auto-advance for this question
      if (!shouldAutoAdvance(config.currentQuestion)) {
        // Multi-select mode: don't auto-advance (Phase 2 feature)
        return
      }

      // Create updated answers array
      const updatedAnswers = [...config.selectedAnswers]
      updatedAnswers[config.currentQuestionIndex] = newAnswer

      // Use provided otherTexts or fall back to config
      const finalOtherTexts = updatedOtherTexts || config.otherTexts

      // Check if all questions are now answered
      if (areAllQuestionsAnswered(updatedAnswers, finalOtherTexts)) {
        // All answered: go to confirm screen (onSubmit here triggers confirm screen navigation)
        config.onSubmit(updatedAnswers, finalOtherTexts)
      } else if (!config.isLastQuestion) {
        // Auto-advance to next question after delay
        const delay = config.delayMs ?? ASK_USER_CONFIG.AUTO_ADVANCE_DELAY_MS

        timeoutRef.current = setTimeout(() => {
          config.onAdvanceQuestion()
          timeoutRef.current = null
        }, delay)
      }
    },
    [
      config.isLastQuestion,
      config.currentQuestionIndex,
      config.currentQuestion,
      config.selectedAnswers,
      config.otherTexts,
      config.delayMs,
      config.onSubmit,
      config.onAdvanceQuestion,
      clearAdvanceTimeout,
    ]
  )

  /**
   * Handle text input advancement (when Enter pressed in text field)
   */
  const handleTextInputAdvance = useCallback(() => {
    const currentOtherText = config.otherTexts[config.currentQuestionIndex]?.trim()

    if (!currentOtherText) {
      // No text entered, don't advance
      return
    }

    if (!config.isLastQuestion) {
      // Advance to next question
      config.onAdvanceQuestion()
    } else {
      // On last question: submit if all answered
      if (areAllQuestionsAnswered(config.selectedAnswers, config.otherTexts)) {
        config.onSubmit(config.selectedAnswers, config.otherTexts)
      }
    }
  }, [
    config.isLastQuestion,
    config.currentQuestionIndex,
    config.selectedAnswers,
    config.otherTexts,
    config.onSubmit,
    config.onAdvanceQuestion,
  ])

  /**
   * Force submit if all questions answered (Ctrl+Enter)
   */
  const forceSubmit = useCallback(() => {
    if (areAllQuestionsAnswered(config.selectedAnswers, config.otherTexts)) {
      config.onSubmit(config.selectedAnswers, config.otherTexts)
    }
  }, [config.selectedAnswers, config.otherTexts, config.onSubmit])

  return {
    handleSelection,
    handleTextInputAdvance,
    forceSubmit,
    clearAdvanceTimeout,
  }
}
