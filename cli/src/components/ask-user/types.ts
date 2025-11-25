/**
 * Type definitions for the ask_user tool
 */

import type { AskUserQuestion } from '../../state/chat-store'

// Re-export for convenience
export type { AskUserQuestion }

/**
 * Focus target represents what element currently has focus in the form
 */
export type FocusTarget =
  | { type: 'option'; questionIndex: number; optionIndex: number }
  | { type: 'textInput'; questionIndex: number }

  | { type: 'confirmSubmit' }


/** Type alias for option focus */
export type OptionFocus = Extract<FocusTarget, { type: 'option' }>

/** Type alias for text input focus */
export type TextInputFocus = Extract<FocusTarget, { type: 'textInput' }>



/** Type alias for confirm submit button focus */
export type ConfirmSubmitFocus = Extract<FocusTarget, { type: 'confirmSubmit' }>


/**
 * Answer state can be:
 * - number: single-select (index of selected option, or -1 for none)
 * - number[]: multi-select (array of selected option indices)
 */
export type AnswerState = number | number[]

/**
 * Layout modes based on terminal width
 */
export type LayoutMode = 'compact' | 'comfortable' | 'spacious'

/**
 * Direction for navigation
 */
export type NavigationDirection = 'up' | 'down' | 'left' | 'right' | 'tab'

/**
 * Navigation context for pure functions
 */
export interface NavigationContext {
  currentQuestionIndex: number
  totalQuestions: number
  currentQuestion: AskUserQuestion
  wrapQuestions: boolean
  wrapOptions: boolean
}

// ====================
// Type Guards
// ====================

/**
 * Type guard: check if focus is on an option
 */
export const isFocusOnOption = (target: FocusTarget): target is OptionFocus => {
  return target.type === 'option'
}

/**
 * Type guard: check if focus is on text input
 */
export const isFocusOnTextInput = (target: FocusTarget): target is TextInputFocus => {
  return target.type === 'textInput'
}



/**
 * Type guard: check if focus is on confirm submit button
 */
export const isFocusOnConfirmSubmit = (target: FocusTarget): target is ConfirmSubmitFocus => {
  return target.type === 'confirmSubmit'
}



/**
 * Type guard: check if focus is on confirm screen (either button)
 */
export const isFocusOnConfirmScreen = (target: FocusTarget): boolean => {
  return target.type === 'confirmSubmit'
}

/**
 * Type guard: check if answer is multi-select
 */
export const isMultiSelectAnswer = (answer: AnswerState): answer is number[] => {
  return Array.isArray(answer)
}

/**
 * Type guard: check if answer is single-select
 */
export const isSingleSelectAnswer = (answer: AnswerState): answer is number => {
  return typeof answer === 'number'
}

// ====================
// Factory Functions
// ====================

/**
 * Create focus target for an option
 */
export const createOptionFocus = (questionIndex: number, optionIndex: number): OptionFocus => ({
  type: 'option',
  questionIndex,
  optionIndex,
})

/**
 * Create focus target for text input
 */
export const createTextInputFocus = (questionIndex: number): TextInputFocus => ({
  type: 'textInput',
  questionIndex,
})



/**
 * Create focus target for confirm submit button
 */
export const createConfirmSubmitFocus = (): ConfirmSubmitFocus => ({
  type: 'confirmSubmit',
})



// ====================
// Helper Functions
// ====================

/**
 * Check if a question has been answered
 */
export const isQuestionAnswered = (answer: AnswerState, otherText: string): boolean => {
  if (isMultiSelectAnswer(answer)) {
    return answer.length > 0 || !!otherText?.trim()
  }
  return answer !== -1 || !!otherText?.trim()
}

/**
 * Check if all questions have been answered
 */
export const areAllQuestionsAnswered = (
  answers: AnswerState[],
  otherTexts: string[]
): boolean => {
  return answers.every((answer, i) => isQuestionAnswered(answer, otherTexts[i]))
}
