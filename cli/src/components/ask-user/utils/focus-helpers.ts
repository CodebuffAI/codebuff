/**
 * Helper utilities for focus management
 */

import { isFocusOnOption, isFocusOnTextInput } from '../types'

import type { FocusTarget } from '../types'

/**
 * Check if two focus targets are equal
 */
export function isFocusEqual(a: FocusTarget, b: FocusTarget): boolean {
  if (a.type !== b.type) return false

  if (a.type === 'confirmSubmit' && b.type === 'confirmSubmit') return true

  if (a.type === 'textInput' && b.type === 'textInput') {
    return a.questionIndex === b.questionIndex
  }

  if (a.type === 'option' && b.type === 'option') {
    return a.questionIndex === b.questionIndex && a.optionIndex === b.optionIndex
  }

  return false
}

/**
 * Check if focus is on a specific question
 */
export function isFocusOnQuestion(focus: FocusTarget, questionIndex: number): boolean {
  if (isFocusOnOption(focus)) {
    return focus.questionIndex === questionIndex
  }
  if (isFocusOnTextInput(focus)) {
    return focus.questionIndex === questionIndex
  }
  return false
}

/**
 * Check if focus is on a specific option
 */
export function isFocusOnSpecificOption(
  focus: FocusTarget,
  questionIndex: number,
  optionIndex: number
): boolean {
  return (
    isFocusOnOption(focus) &&
    focus.questionIndex === questionIndex &&
    focus.optionIndex === optionIndex
  )
}

/**
 * Check if focus is on the text input for a specific question
 */
export function isFocusOnSpecificTextInput(
  focus: FocusTarget,
  questionIndex: number
): boolean {
  return isFocusOnTextInput(focus) && focus.questionIndex === questionIndex
}

/**
 * Get a string representation of focus (useful for debugging)
 */
export function focusToString(focus: FocusTarget): string {
  if (focus.type === 'textInput') return `textInput:Q${focus.questionIndex}`
  if (focus.type === 'option') {
    return `option:Q${focus.questionIndex}:O${focus.optionIndex}`
  }
  if (focus.type === 'confirmSubmit') return 'confirmSubmit'
  return 'unknown'
}
