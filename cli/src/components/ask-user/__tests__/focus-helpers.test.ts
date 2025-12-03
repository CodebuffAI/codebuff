/**
 * Unit tests for focus-helpers.ts
 * Testing focus utility functions
 */

import { describe, it, expect } from 'bun:test'

import {
  createOptionFocus,
  createTextInputFocus,
  createConfirmSubmitFocus,
} from '../types'
import {
  isFocusEqual,
  isFocusOnQuestion,
  isFocusOnSpecificOption,
  isFocusOnSpecificTextInput,
  focusToString,
} from '../utils/focus-helpers'

describe('isFocusEqual', () => {
  it('returns true for identical confirm submit focus', () => {
    const a = createConfirmSubmitFocus()
    const b = createConfirmSubmitFocus()
    expect(isFocusEqual(a, b)).toBe(true)
  })

  it('returns true for identical text input focus', () => {
    const a = createTextInputFocus(2)
    const b = createTextInputFocus(2)
    expect(isFocusEqual(a, b)).toBe(true)
  })

  it('returns false for text input with different question index', () => {
    const a = createTextInputFocus(0)
    const b = createTextInputFocus(1)
    expect(isFocusEqual(a, b)).toBe(false)
  })

  it('returns true for identical option focus', () => {
    const a = createOptionFocus(1, 2)
    const b = createOptionFocus(1, 2)
    expect(isFocusEqual(a, b)).toBe(true)
  })

  it('returns false for option with different question index', () => {
    const a = createOptionFocus(0, 1)
    const b = createOptionFocus(1, 1)
    expect(isFocusEqual(a, b)).toBe(false)
  })

  it('returns false for option with different option index', () => {
    const a = createOptionFocus(1, 0)
    const b = createOptionFocus(1, 1)
    expect(isFocusEqual(a, b)).toBe(false)
  })

  it('returns false for different focus types', () => {
    const option = createOptionFocus(0, 0)
    const textInput = createTextInputFocus(0)
    const confirmSubmit = createConfirmSubmitFocus()

    expect(isFocusEqual(option, textInput)).toBe(false)
    expect(isFocusEqual(option, confirmSubmit)).toBe(false)
    expect(isFocusEqual(textInput, confirmSubmit)).toBe(false)
  })
})

describe('isFocusOnQuestion', () => {
  it('returns true for option focus on specified question', () => {
    const focus = createOptionFocus(2, 1)
    expect(isFocusOnQuestion(focus, 2)).toBe(true)
  })

  it('returns false for option focus on different question', () => {
    const focus = createOptionFocus(2, 1)
    expect(isFocusOnQuestion(focus, 1)).toBe(false)
  })

  it('returns true for text input focus on specified question', () => {
    const focus = createTextInputFocus(3)
    expect(isFocusOnQuestion(focus, 3)).toBe(true)
  })

  it('returns false for text input focus on different question', () => {
    const focus = createTextInputFocus(3)
    expect(isFocusOnQuestion(focus, 2)).toBe(false)
  })

  it('returns false for confirm submit focus (not on any question)', () => {
    const focus = createConfirmSubmitFocus()
    expect(isFocusOnQuestion(focus, 0)).toBe(false)
    expect(isFocusOnQuestion(focus, 5)).toBe(false)
  })
})

describe('isFocusOnSpecificOption', () => {
  it('returns true for exact match', () => {
    const focus = createOptionFocus(1, 2)
    expect(isFocusOnSpecificOption(focus, 1, 2)).toBe(true)
  })

  it('returns false for different question index', () => {
    const focus = createOptionFocus(1, 2)
    expect(isFocusOnSpecificOption(focus, 0, 2)).toBe(false)
  })

  it('returns false for different option index', () => {
    const focus = createOptionFocus(1, 2)
    expect(isFocusOnSpecificOption(focus, 1, 1)).toBe(false)
  })

  it('returns false for text input focus', () => {
    const focus = createTextInputFocus(1)
    expect(isFocusOnSpecificOption(focus, 1, 0)).toBe(false)
  })

  it('returns false for confirm submit focus', () => {
    const focus = createConfirmSubmitFocus()
    expect(isFocusOnSpecificOption(focus, 0, 0)).toBe(false)
  })
})

describe('isFocusOnSpecificTextInput', () => {
  it('returns true for exact match', () => {
    const focus = createTextInputFocus(3)
    expect(isFocusOnSpecificTextInput(focus, 3)).toBe(true)
  })

  it('returns false for different question index', () => {
    const focus = createTextInputFocus(3)
    expect(isFocusOnSpecificTextInput(focus, 2)).toBe(false)
  })

  it('returns false for option focus', () => {
    const focus = createOptionFocus(3, 0)
    expect(isFocusOnSpecificTextInput(focus, 3)).toBe(false)
  })

  it('returns false for confirm submit focus', () => {
    const focus = createConfirmSubmitFocus()
    expect(isFocusOnSpecificTextInput(focus, 0)).toBe(false)
  })
})

describe('focusToString', () => {
  it('formats confirm submit focus', () => {
    const focus = createConfirmSubmitFocus()
    expect(focusToString(focus)).toBe('confirmSubmit')
  })

  it('formats text input focus', () => {
    const focus = createTextInputFocus(2)
    expect(focusToString(focus)).toBe('textInput:Q2')
  })

  it('formats option focus', () => {
    const focus = createOptionFocus(1, 3)
    expect(focusToString(focus)).toBe('option:Q1:O3')
  })

  it('formats various question and option indices', () => {
    expect(focusToString(createOptionFocus(0, 0))).toBe('option:Q0:O0')
    expect(focusToString(createOptionFocus(5, 2))).toBe('option:Q5:O2')
    expect(focusToString(createTextInputFocus(0))).toBe('textInput:Q0')
    expect(focusToString(createTextInputFocus(10))).toBe('textInput:Q10')
  })
})
