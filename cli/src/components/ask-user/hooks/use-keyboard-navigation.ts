/**
 * Hook for handling keyboard navigation in the ask_user form
 * Integrates with @opentui/react useKeyboard and focus manager
 */

import { useCallback, useRef, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'
import type { FocusTarget, AskUserQuestion } from '../types'
import { isFocusOnOption, isFocusOnTextInput, isFocusOnConfirmSubmit } from '../types'
import type { FocusAction } from './use-focus-manager'
import { calculateNextQuestionIndex } from '../utils/navigation-handlers'
import { ASK_USER_CONFIG } from '../constants'

/**
 * Parameters for keyboard navigation hook
 */
export interface KeyboardNavigationParams {
  focus: FocusTarget
  dispatchFocus: (action: FocusAction) => void
  currentQuestionIndex: number
  totalQuestions: number
  currentQuestion: AskUserQuestion
  isFirstQuestion: boolean
  isLastQuestion: boolean
  isOnConfirmScreen: boolean
  allAnswered: boolean
  selectedAnswers: (number | number[])[]
  otherTexts: string[]
  onSelectAnswer: (questionIndex: number, optionIndex: number) => void
  onOtherTextChange: (questionIndex: number, text: string) => void
  onChangeQuestion: (newIndex: number) => void
  onSubmit: (answers?: (number | number[])[], otherTexts?: string[]) => void
  onAutoAdvance: (newAnswer: number) => void
  onTextInputAdvance: () => void
  onForceSubmit: () => void
  onGoToConfirm: () => void
  onGoBackFromConfirm: () => void
}

/**
 * Hook for keyboard navigation
 */
export function useKeyboardNavigation(params: KeyboardNavigationParams) {
  const {
    focus,
    dispatchFocus,
    currentQuestionIndex,
    totalQuestions,
    currentQuestion,
    isFirstQuestion,
    isLastQuestion,
    isOnConfirmScreen,
    allAnswered,
    otherTexts,
    onSelectAnswer,
    onOtherTextChange,
    onChangeQuestion,
    onSubmit,
    onAutoAdvance,
    onTextInputAdvance,
    onForceSubmit,
    onGoToConfirm,
    onGoBackFromConfirm,
  } = params

  // Use refs for frequently changing values to avoid recreating the keyboard callback
  const paramsRef = useRef(params)
  useEffect(() => {
    paramsRef.current = params
  })

  useKeyboard(
    useCallback(
      (key) => {
        // Get current values from ref to avoid stale closures
        const {
          focus,
          dispatchFocus,
          currentQuestionIndex,
          totalQuestions,
          isFirstQuestion,
          isLastQuestion,
          isOnConfirmScreen,
          otherTexts,
          onSelectAnswer,
          onOtherTextChange,
          onChangeQuestion,
          onSubmit,
          onAutoAdvance,
          onTextInputAdvance,
          onForceSubmit,
          onGoToConfirm,
          onGoBackFromConfirm,
        } = paramsRef.current

        // Helper to prevent default behavior
        const preventDefault = () => {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
        }

        // ====================
        // Question Navigation (Left/Right)
        // ====================

        if (key.name === 'left' && !key.ctrl && !key.meta && !key.shift) {
          // When in text input, don't navigate questions - let arrow keys work as cursor
          if (isFocusOnTextInput(focus)) {
            return // Don't prevent default, let cursor navigation work
          }
          // On confirm screen, go back to last question
          if (isOnConfirmScreen) {
            preventDefault()
            onGoBackFromConfirm()
            return
          }
          preventDefault()
          if (!isFirstQuestion) {
            const prevIndex = calculateNextQuestionIndex(
              currentQuestionIndex,
              'prev',
              totalQuestions,
              ASK_USER_CONFIG.WRAP_QUESTIONS
            )
            onChangeQuestion(prevIndex)
            dispatchFocus({ type: 'RESET_TO_QUESTION', questionIndex: prevIndex })
          }
          return
        }

        if (key.name === 'right' && !key.ctrl && !key.meta && !key.shift) {
          // When in text input, don't navigate questions - let arrow keys work as cursor
          if (isFocusOnTextInput(focus)) {
            return // Don't prevent default, let cursor navigation work
          }
          // On confirm screen, right does nothing (already at the end)
          if (isOnConfirmScreen) {
            return
          }
          preventDefault()
          // If on last question, go to confirm screen
          if (isLastQuestion) {
            onGoToConfirm()
            return
          }
          if (!isLastQuestion) {
            const nextIndex = calculateNextQuestionIndex(
              currentQuestionIndex,
              'next',
              totalQuestions,
              ASK_USER_CONFIG.WRAP_QUESTIONS
            )
            onChangeQuestion(nextIndex)
            dispatchFocus({ type: 'RESET_TO_QUESTION', questionIndex: nextIndex })
          }
          return
        }

        // ====================
        // Option Navigation (Up/Down)
        // ====================

        if (key.name === 'up' && !key.ctrl && !key.meta && !key.shift) {
          preventDefault()
          // On confirm screen, up/down does nothing (only submit button)
          if (isOnConfirmScreen) {
            return
          }
          dispatchFocus({ type: 'NAVIGATE_UP' })
          return
        }

        if (key.name === 'down' && !key.ctrl && !key.meta && !key.shift) {
          preventDefault()
          // On confirm screen, up/down does nothing (only submit button)
          if (isOnConfirmScreen) {
            return
          }
          dispatchFocus({ type: 'NAVIGATE_DOWN' })
          return
        }

        // ====================
        // Tab (Cycle Focus)
        // ====================

        if (key.name === 'tab' && !key.ctrl && !key.meta && !key.shift) {
          preventDefault()
          // On confirm screen, tab does nothing (only submit button)
          if (isOnConfirmScreen) {
            return
          }
          dispatchFocus({ type: 'TAB_NEXT' })
          return
        }

        // ====================
        // Enter/Space (Select)
        // ====================

        if (
          (key.name === 'return' || key.name === 'enter' || key.name === 'space') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift
        ) {
          // Handle space in text input: add space character and return
          if (isFocusOnTextInput(focus) && key.name === 'space') {
            const currentText = otherTexts[currentQuestionIndex] || ''
            onOtherTextChange(currentQuestionIndex, currentText + ' ')
            return
          }

          preventDefault()

          if (isFocusOnOption(focus)) {
            // Select option
            onSelectAnswer(focus.questionIndex, focus.optionIndex)
            // Let auto-advance hook handle the rest
            onAutoAdvance(focus.optionIndex)
          } else if (isFocusOnTextInput(focus)) {
            // Advance if text input has content
            onTextInputAdvance()
          } else if (isFocusOnConfirmSubmit(focus)) {
            // Submit from confirm screen
            onSubmit()
          }
          return
        }

        // ====================
        // Ctrl/Cmd + Enter (Force Submit)
        // ====================

        if (
          (key.name === 'return' || key.name === 'enter') &&
          (key.ctrl || key.meta) &&
          !key.shift
        ) {
          preventDefault()
          onForceSubmit()
          return
        }

        // ====================
        // Text Input Handling
        // ====================

        if (isFocusOnTextInput(focus)) {
          // Backspace
          if (key.name === 'backspace') {
            const currentText = otherTexts[currentQuestionIndex] || ''
            onOtherTextChange(currentQuestionIndex, currentText.slice(0, -1))
            return
          }

          // Character input
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            const currentText = otherTexts[currentQuestionIndex] || ''
            onOtherTextChange(currentQuestionIndex, currentText + key.sequence)
            return
          }
        }
      },
      [] // Empty deps - callback is stable, values accessed via ref
    )
  )
}
