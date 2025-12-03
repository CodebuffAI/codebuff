/**
 * Unit tests for types.ts
 * Testing type guards, factory functions, and helper utilities
 */

import { describe, it, expect } from 'bun:test'

import {
  isFocusOnOption,
  isFocusOnTextInput,
  isMultiSelectAnswer,
  isSingleSelectAnswer,
  createOptionFocus,
  createTextInputFocus,
  createConfirmSubmitFocus,
  isQuestionAnswered,
  areAllQuestionsAnswered,
} from '../types'

describe('Type Guards', () => {
  describe('isFocusOnOption', () => {
    it('returns true for option focus', () => {
      const focus = createOptionFocus(0, 1)
      expect(isFocusOnOption(focus)).toBe(true)
    })

    it('returns false for text input focus', () => {
      const focus = createTextInputFocus(0)
      expect(isFocusOnOption(focus)).toBe(false)
    })

    it('returns false for confirm submit focus', () => {
      const focus = createConfirmSubmitFocus()
      expect(isFocusOnOption(focus)).toBe(false)
    })
  })

  describe('isFocusOnTextInput', () => {
    it('returns true for text input focus', () => {
      const focus = createTextInputFocus(0)
      expect(isFocusOnTextInput(focus)).toBe(true)
    })

    it('returns false for option focus', () => {
      const focus = createOptionFocus(0, 1)
      expect(isFocusOnTextInput(focus)).toBe(false)
    })

    it('returns false for confirm submit focus', () => {
      const focus = createConfirmSubmitFocus()
      expect(isFocusOnTextInput(focus)).toBe(false)
    })
  })

  describe('isMultiSelectAnswer', () => {
    it('returns true for array answer (multi-select)', () => {
      expect(isMultiSelectAnswer([0, 1, 2])).toBe(true)
      expect(isMultiSelectAnswer([])).toBe(true)
    })

    it('returns false for number answer (single-select)', () => {
      expect(isMultiSelectAnswer(0)).toBe(false)
      expect(isMultiSelectAnswer(-1)).toBe(false)
    })
  })

  describe('isSingleSelectAnswer', () => {
    it('returns true for number answer (single-select)', () => {
      expect(isSingleSelectAnswer(0)).toBe(true)
      expect(isSingleSelectAnswer(-1)).toBe(true)
      expect(isSingleSelectAnswer(5)).toBe(true)
    })

    it('returns false for array answer (multi-select)', () => {
      expect(isSingleSelectAnswer([0, 1])).toBe(false)
      expect(isSingleSelectAnswer([])).toBe(false)
    })
  })
})

describe('Factory Functions', () => {
  describe('createOptionFocus', () => {
    it('creates correct option focus object', () => {
      const focus = createOptionFocus(2, 3)
      expect(focus).toEqual({
        type: 'option',
        questionIndex: 2,
        optionIndex: 3,
      })
    })

    it('works with index 0', () => {
      const focus = createOptionFocus(0, 0)
      expect(focus).toEqual({
        type: 'option',
        questionIndex: 0,
        optionIndex: 0,
      })
    })
  })

  describe('createTextInputFocus', () => {
    it('creates correct text input focus object', () => {
      const focus = createTextInputFocus(1)
      expect(focus).toEqual({
        type: 'textInput',
        questionIndex: 1,
      })
    })

    it('works with index 0', () => {
      const focus = createTextInputFocus(0)
      expect(focus).toEqual({
        type: 'textInput',
        questionIndex: 0,
      })
    })
  })

  describe('createConfirmSubmitFocus', () => {
    it('creates correct confirm submit focus object', () => {
      const focus = createConfirmSubmitFocus()
      expect(focus).toEqual({ type: 'confirmSubmit' })
    })
  })
})

describe('Helper Functions', () => {
  describe('isQuestionAnswered', () => {
    describe('single-select (number)', () => {
      it('returns true when option selected (answer >= 0)', () => {
        expect(isQuestionAnswered(0, '')).toBe(true)
        expect(isQuestionAnswered(1, '')).toBe(true)
        expect(isQuestionAnswered(5, '')).toBe(true)
      })

      it('returns false when no option selected (answer === -1)', () => {
        expect(isQuestionAnswered(-1, '')).toBe(false)
      })

      it('returns true when other text provided', () => {
        expect(isQuestionAnswered(-1, 'custom answer')).toBe(true)
        expect(isQuestionAnswered(-1, '  text  ')).toBe(true)
      })

      it('returns false when no answer and no text', () => {
        expect(isQuestionAnswered(-1, '')).toBe(false)
        expect(isQuestionAnswered(-1, '   ')).toBe(false)
      })

      it('ignores whitespace-only text', () => {
        expect(isQuestionAnswered(-1, '   ')).toBe(false)
        expect(isQuestionAnswered(-1, '\t\n')).toBe(false)
      })
    })

    describe('multi-select (array)', () => {
      it('returns true when options selected (non-empty array)', () => {
        expect(isQuestionAnswered([0], '')).toBe(true)
        expect(isQuestionAnswered([0, 1], '')).toBe(true)
        expect(isQuestionAnswered([1, 2, 3], '')).toBe(true)
      })

      it('returns false when no options selected (empty array)', () => {
        expect(isQuestionAnswered([], '')).toBe(false)
      })

      it('returns true when other text provided', () => {
        expect(isQuestionAnswered([], 'custom')).toBe(true)
      })

      it('returns false when empty array and no text', () => {
        expect(isQuestionAnswered([], '')).toBe(false)
        expect(isQuestionAnswered([], '  ')).toBe(false)
      })
    })
  })

  describe('areAllQuestionsAnswered', () => {
    it('returns true when all single-select questions answered', () => {
      const answers = [0, 1, 2]
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns false when any single-select question unanswered', () => {
      const answers = [0, -1, 2]
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })

    it('returns true with mix of options and other text', () => {
      const answers = [0, -1, 2]
      const otherTexts = ['', 'custom text', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns false when all questions unanswered', () => {
      const answers = [-1, -1, -1]
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })

    it('handles multi-select answers', () => {
      const answers: (number | number[])[] = [[0, 1], [2], -1]
      const otherTexts = ['', '', 'text']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns false with empty multi-select and no text', () => {
      const answers: (number | number[])[] = [[0], [], [1]]
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })

    it('handles empty questions array', () => {
      expect(areAllQuestionsAnswered([], [])).toBe(true)
    })

    it('handles single question', () => {
      expect(areAllQuestionsAnswered([0], [''])).toBe(true)
      expect(areAllQuestionsAnswered([-1], [''])).toBe(false)
      expect(areAllQuestionsAnswered([-1], ['text'])).toBe(true)
    })
  })
})
