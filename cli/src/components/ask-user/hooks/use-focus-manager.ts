/**
 * Focus management state machine using reducer pattern
 * Replaces complex conditional logic with explicit state transitions
 */

import { useReducer, useCallback } from 'react'

import { ASK_USER_CONFIG } from '../constants'
import { createOptionFocus } from '../types'
import { getNextFocusOnNavigation } from '../utils/navigation-handlers'

import type { FocusTarget, AskUserQuestion, NavigationContext } from '../types'

/**
 * Actions that can be dispatched to change focus
 */
export type FocusAction =
  | { type: 'NAVIGATE_UP' }
  | { type: 'NAVIGATE_DOWN' }
  | { type: 'NAVIGATE_LEFT' }
  | { type: 'NAVIGATE_RIGHT' }
  | { type: 'TAB_NEXT' }
  | { type: 'SELECT_OPTION'; questionIndex: number; optionIndex: number }
  | { type: 'SELECT_TEXT_INPUT'; questionIndex: number }

  | { type: 'SELECT_CONFIRM_SUBMIT' }
  | { type: 'RESET_TO_QUESTION'; questionIndex: number }
  | { type: 'RESET_TO_CONFIRM' }

/**
 * Context needed for focus reducer
 */
interface FocusReducerContext {
  currentQuestionIndex: number
  questions: AskUserQuestion[]
  wrapQuestions: boolean
  wrapOptions: boolean
}

/**
 * Focus reducer - pure function that handles state transitions
 */
function focusReducer(
  state: FocusTarget,
  action: FocusAction,
  context: FocusReducerContext,
): FocusTarget {
  const currentQuestion = context.questions[context.currentQuestionIndex]

  // Build navigation context
  const navContext: NavigationContext = {
    currentQuestionIndex: context.currentQuestionIndex,
    totalQuestions: context.questions.length,
    currentQuestion,
    wrapQuestions: context.wrapQuestions,
    wrapOptions: context.wrapOptions,
  }

  switch (action.type) {
    case 'NAVIGATE_UP':
      return getNextFocusOnNavigation(state, 'up', navContext)

    case 'NAVIGATE_DOWN':
      return getNextFocusOnNavigation(state, 'down', navContext)

    case 'TAB_NEXT':
      return getNextFocusOnNavigation(state, 'tab', navContext)

    case 'SELECT_OPTION':
      return {
        type: 'option',
        questionIndex: action.questionIndex,
        optionIndex: action.optionIndex,
      }

    case 'SELECT_TEXT_INPUT':
      return {
        type: 'textInput',
        questionIndex: action.questionIndex,
      }



    case 'SELECT_CONFIRM_SUBMIT':
      return { type: 'confirmSubmit' }

    case 'RESET_TO_CONFIRM':
      return { type: 'confirmSubmit' }

    case 'RESET_TO_QUESTION':
      // Reset focus to first option of specified question
      return createOptionFocus(action.questionIndex, 0)

    case 'NAVIGATE_LEFT':
    case 'NAVIGATE_RIGHT':
      // These are handled at a higher level (change currentQuestionIndex)
      // Reducer just maintains current focus
      return state

    default:
      return state
  }
}

/**
 * Hook for managing focus state with reducer pattern
 */
export function useFocusManager(
  questions: AskUserQuestion[],
  currentQuestionIndex: number,
) {
  // Initial focus: first option of first question
  const initialFocus: FocusTarget = createOptionFocus(0, 0)

  // Context for reducer
  const context: FocusReducerContext = {
    currentQuestionIndex,
    questions,
    wrapQuestions: ASK_USER_CONFIG.WRAP_QUESTIONS,
    wrapOptions: ASK_USER_CONFIG.WRAP_OPTIONS,
  }

  // Wrap reducer with context
  const [focus, baseDispatch] = useReducer(
    (state: FocusTarget, action: FocusAction) =>
      focusReducer(state, action, context),
    initialFocus,
  )

  // Memoize dispatch function
  const dispatch = useCallback(
    (action: FocusAction) => {
      baseDispatch(action)
    },
    [baseDispatch],
  )

  return {
    focus,
    dispatch,
  }
}

/**
 * Helper hook to create common focus actions
 */
export function useFocusActions(dispatch: (action: FocusAction) => void) {
  const navigateUp = useCallback(() => {
    dispatch({ type: 'NAVIGATE_UP' })
  }, [dispatch])

  const navigateDown = useCallback(() => {
    dispatch({ type: 'NAVIGATE_DOWN' })
  }, [dispatch])

  const tabNext = useCallback(() => {
    dispatch({ type: 'TAB_NEXT' })
  }, [dispatch])

  const selectOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      dispatch({ type: 'SELECT_OPTION', questionIndex, optionIndex })
    },
    [dispatch],
  )

  const selectTextInput = useCallback(
    (questionIndex: number) => {
      dispatch({ type: 'SELECT_TEXT_INPUT', questionIndex })
    },
    [dispatch],
  )


  const resetToQuestion = useCallback(
    (questionIndex: number) => {
      dispatch({ type: 'RESET_TO_QUESTION', questionIndex })
    },
    [dispatch],
  )

  const selectConfirmSubmit = useCallback(() => {
    dispatch({ type: 'SELECT_CONFIRM_SUBMIT' })
  }, [dispatch])

  const resetToConfirm = useCallback(() => {
    dispatch({ type: 'RESET_TO_CONFIRM' })
  }, [dispatch])

  return {
    navigateUp,
    navigateDown,
    tabNext,
    selectOption,
    selectTextInput,

    selectConfirmSubmit,
    resetToQuestion,
    resetToConfirm,
  }
}
