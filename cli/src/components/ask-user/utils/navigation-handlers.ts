/**
 * Pure functions for navigation logic in the ask_user form
 * All functions are testable without React
 */

import {
  createOptionFocus,
  createTextInputFocus,
  isFocusOnOption,
  isFocusOnTextInput,
} from '../types'

import type {
  FocusTarget,
  NavigationContext,
  NavigationDirection,
  AskUserQuestion,
} from '../types'

/**
 * Calculate next question index when navigating left/right
 */
export function calculateNextQuestionIndex(
  current: number,
  direction: 'prev' | 'next',
  total: number,
  wrap: boolean
): number {
  if (direction === 'prev') {
    if (current === 0) {
      return wrap ? total - 1 : 0
    }
    return current - 1
  } else {
    // direction === 'next'
    if (current === total - 1) {
      return wrap ? 0 : total - 1
    }
    return current + 1
  }
}

/**
 * Calculate next option index when navigating up/down
 */
export function calculateNextOptionIndex(
  current: number,
  direction: 'up' | 'down',
  total: number,
  wrap: boolean
): number {
  if (direction === 'up') {
    if (current === 0) {
      return wrap ? total - 1 : 0
    }
    return current - 1
  } else {
    // direction === 'down'
    if (current === total - 1) {
      return wrap ? 0 : total - 1
    }
    return current + 1
  }
}

/**
 * Get the next focus target when navigating up from current focus
 */
export function getNextFocusUp(
  current: FocusTarget,
  context: NavigationContext
): FocusTarget {
  if (isFocusOnTextInput(current)) {
    // From text input → last option
    const lastOptionIndex = context.currentQuestion.options.length - 1
    return createOptionFocus(context.currentQuestionIndex, lastOptionIndex)
  }

  if (isFocusOnOption(current)) {
    // From option → previous option (or stay at first)
    if (current.optionIndex > 0) {
      return createOptionFocus(current.questionIndex, current.optionIndex - 1)
    }
    // Already at first option, stay or wrap
    if (context.wrapOptions) {
      const lastOptionIndex = context.currentQuestion.options.length - 1
      return createOptionFocus(current.questionIndex, lastOptionIndex)
    }
    return current
  }

  return current
}

/**
 * Get the next focus target when navigating down from current focus
 */
export function getNextFocusDown(
  current: FocusTarget,
  context: NavigationContext
): FocusTarget {
  if (isFocusOnTextInput(current)) {
    // From text input → first option (cycle)
    return createOptionFocus(context.currentQuestionIndex, 0)
  }

  if (isFocusOnOption(current)) {
    const lastOptionIndex = context.currentQuestion.options.length - 1

    if (current.optionIndex < lastOptionIndex) {
      // Go to next option
      return createOptionFocus(current.questionIndex, current.optionIndex + 1)
    } else {
      // At last option → go to text input
      return createTextInputFocus(context.currentQuestionIndex)
    }
  }

  return current
}

/**
 * Get the next focus target when tabbing (cycles through all elements)
 */
export function getNextFocusTab(
  current: FocusTarget,
  context: NavigationContext
): FocusTarget {
  if (isFocusOnOption(current)) {
    // From option → text input
    return createTextInputFocus(context.currentQuestionIndex)
  }

  if (isFocusOnTextInput(current)) {
    // From text input → first option (cycle back)
    return createOptionFocus(context.currentQuestionIndex, 0)
  }

  return current
}

/**
 * Get the next focus target when changing questions (left/right navigation)
 * Resets focus to first option of new question
 */
export function getFocusForQuestion(questionIndex: number): FocusTarget {
  return createOptionFocus(questionIndex, 0)
}

/**
 * Main navigation function - handles all navigation directions
 */
export function getNextFocusOnNavigation(
  current: FocusTarget,
  direction: NavigationDirection,
  context: NavigationContext
): FocusTarget {
  switch (direction) {
    case 'up':
      return getNextFocusUp(current, context)
    case 'down':
      return getNextFocusDown(current, context)
    case 'tab':
      return getNextFocusTab(current, context)
    case 'left':
    case 'right':
      // These are handled at a higher level (change currentQuestionIndex)
      // But we can return the initial focus for the new question
      return current
    default:
      return current
  }
}

/**
 * Check if we should auto-advance after selection
 * Returns false for multi-select questions (user must manually advance or submit)
 */
export function shouldAutoAdvance(question: AskUserQuestion): boolean {
  // Don't auto-advance for multi-select (checkboxes)
  // User needs to select multiple options, so they advance manually
  return !question.multiSelect
}
