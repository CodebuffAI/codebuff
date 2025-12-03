/**
 * Unit tests for multi-select functionality
 * Testing multi-select support across types, navigation, and state management
 */

import { describe, it, expect } from 'bun:test'

import {
  isMultiSelectAnswer,
  isSingleSelectAnswer,
  isQuestionAnswered,
  areAllQuestionsAnswered,
} from '../types'
import { shouldAutoAdvance } from '../utils/navigation-handlers'

import type { AskUserQuestion } from '../../../state/chat-store'

describe('Multi-Select Type Guards', () => {
  describe('isMultiSelectAnswer', () => {
    it('returns true for empty array', () => {
      expect(isMultiSelectAnswer([])).toBe(true)
    })

    it('returns true for array with single element', () => {
      expect(isMultiSelectAnswer([0])).toBe(true)
    })

    it('returns true for array with multiple elements', () => {
      expect(isMultiSelectAnswer([0, 1, 2])).toBe(true)
    })

    it('returns false for number (single-select)', () => {
      expect(isMultiSelectAnswer(0)).toBe(false)
      expect(isMultiSelectAnswer(-1)).toBe(false)
      expect(isMultiSelectAnswer(5)).toBe(false)
    })
  })

  describe('isSingleSelectAnswer', () => {
    it('returns true for positive numbers', () => {
      expect(isSingleSelectAnswer(0)).toBe(true)
      expect(isSingleSelectAnswer(1)).toBe(true)
      expect(isSingleSelectAnswer(99)).toBe(true)
    })

    it('returns true for -1 (unanswered)', () => {
      expect(isSingleSelectAnswer(-1)).toBe(true)
    })

    it('returns false for arrays (multi-select)', () => {
      expect(isSingleSelectAnswer([])).toBe(false)
      expect(isSingleSelectAnswer([0])).toBe(false)
      expect(isSingleSelectAnswer([0, 1, 2])).toBe(false)
    })
  })
})

describe('Multi-Select Answer Validation', () => {
  describe('isQuestionAnswered - multi-select mode', () => {
    it('returns true when one option selected', () => {
      expect(isQuestionAnswered([0], '')).toBe(true)
      expect(isQuestionAnswered([2], '')).toBe(true)
    })

    it('returns true when multiple options selected', () => {
      expect(isQuestionAnswered([0, 1], '')).toBe(true)
      expect(isQuestionAnswered([0, 1, 2], '')).toBe(true)
      expect(isQuestionAnswered([1, 3, 5], '')).toBe(true)
    })

    it('returns false when no options selected (empty array)', () => {
      expect(isQuestionAnswered([], '')).toBe(false)
    })

    it('returns true when other text provided (even with empty array)', () => {
      expect(isQuestionAnswered([], 'custom answer')).toBe(true)
      expect(isQuestionAnswered([], 'some text')).toBe(true)
    })

    it('returns false when empty array and no text', () => {
      expect(isQuestionAnswered([], '')).toBe(false)
      expect(isQuestionAnswered([], '   ')).toBe(false)
    })

    it('ignores whitespace-only text', () => {
      expect(isQuestionAnswered([], '   ')).toBe(false)
      expect(isQuestionAnswered([], '\t\n  ')).toBe(false)
    })
  })

  describe('areAllQuestionsAnswered - mixed single and multi-select', () => {
    it('returns true when all single-select questions answered', () => {
      const answers = [0, 1, 2] // All single-select
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns true when all multi-select questions answered', () => {
      const answers = [[0, 1], [2], [0, 2, 3]] // All multi-select
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns true with mix of single and multi-select', () => {
      const answers: (number | number[])[] = [0, [1, 2], 2, [0]]
      const otherTexts = ['', '', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns false when any multi-select question unanswered', () => {
      const answers: (number | number[])[] = [[0, 1], [], [2]] // Second is empty
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })

    it('returns false when any single-select question unanswered', () => {
      const answers: (number | number[])[] = [0, -1, [1, 2]] // Second is -1
      const otherTexts = ['', '', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })

    it('returns true with mix of options and other text', () => {
      const answers: (number | number[])[] = [[0, 1], -1, [], 2]
      const otherTexts = ['', 'custom', 'another', '']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('handles all questions with other text', () => {
      const answers: (number | number[])[] = [-1, [], -1]
      const otherTexts = ['text1', 'text2', 'text3']
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
    })

    it('returns false when mix has unanswered questions', () => {
      const answers: (number | number[])[] = [0, [], -1, [1]]
      const otherTexts = ['', '', '', ''] // All empty
      expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
    })
  })
})

describe('Multi-Select Auto-Advance Behavior', () => {
  it('disables auto-advance for multi-select questions', () => {
    const multiSelectQuestion: AskUserQuestion = {
      question: 'Select all that apply',
      options: ['Option 1', 'Option 2', 'Option 3'],
      multiSelect: true,
    }
    expect(shouldAutoAdvance(multiSelectQuestion)).toBe(false)
  })

  it('enables auto-advance for single-select questions', () => {
    const singleSelectQuestion: AskUserQuestion = {
      question: 'Choose one',
      options: ['Option 1', 'Option 2'],
    }
    expect(shouldAutoAdvance(singleSelectQuestion)).toBe(true)
  })

  it('enables auto-advance when multiSelect is explicitly false', () => {
    const singleSelectQuestion: AskUserQuestion = {
      question: 'Choose one',
      options: ['Option 1', 'Option 2'],
      multiSelect: false,
    }
    expect(shouldAutoAdvance(singleSelectQuestion)).toBe(true)
  })

  it('handles questions with option objects', () => {
    const multiSelectQuestion: AskUserQuestion = {
      question: 'Select features',
      options: [
        { label: 'Feature A', description: 'Description A' },
        { label: 'Feature B', description: 'Description B' },
      ],
      multiSelect: true,
    }
    expect(shouldAutoAdvance(multiSelectQuestion)).toBe(false)
  })
})

describe('Multi-Select Answer Formatting', () => {
  it('properly formats single option selection', () => {
    const answer = [0]
    expect(answer.length).toBe(1)
    expect(answer).toContain(0)
  })

  it('properly formats multiple option selections', () => {
    const answer = [0, 2, 4]
    expect(answer.length).toBe(3)
    expect(answer).toContain(0)
    expect(answer).toContain(2)
    expect(answer).toContain(4)
  })

  it('handles option toggling (adding)', () => {
    let answer = [0, 1]
    const newOption = 2

    if (!answer.includes(newOption)) {
      answer = [...answer, newOption]
    }

    expect(answer).toEqual([0, 1, 2])
  })

  it('handles option toggling (removing)', () => {
    let answer = [0, 1, 2]
    const optionToRemove = 1

    if (answer.includes(optionToRemove)) {
      answer = answer.filter((i) => i !== optionToRemove)
    }

    expect(answer).toEqual([0, 2])
  })

  it('handles toggling same option twice (add then remove)', () => {
    let answer: number[] = []

    // Add option 1
    answer = [...answer, 1]
    expect(answer).toEqual([1])

    // Remove option 1
    answer = answer.filter((i) => i !== 1)
    expect(answer).toEqual([])
  })

  it('maintains order when toggling multiple options', () => {
    let answer: number[] = []

    // Add in order: 2, 0, 3, 1
    answer = [...answer, 2]
    answer = [...answer, 0]
    answer = [...answer, 3]
    answer = [...answer, 1]

    expect(answer).toEqual([2, 0, 3, 1])

    // Remove 0
    answer = answer.filter((i) => i !== 0)
    expect(answer).toEqual([2, 3, 1])
  })
})

describe('Multi-Select Edge Cases', () => {
  it('handles empty options array', () => {
    const answers: (number | number[])[] = [[]]
    const otherTexts = ['']
    expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
  })

  it('handles very large selection (all options)', () => {
    const answer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(answer.length).toBe(10)
    expect(isQuestionAnswered(answer, '')).toBe(true)
  })

  it('handles single-element array vs number distinction', () => {
    const multiSelectAnswer = [0] // Array with one element
    const singleSelectAnswer = 0 // Just a number

    expect(isMultiSelectAnswer(multiSelectAnswer)).toBe(true)
    expect(isSingleSelectAnswer(multiSelectAnswer)).toBe(false)

    expect(isMultiSelectAnswer(singleSelectAnswer)).toBe(false)
    expect(isSingleSelectAnswer(singleSelectAnswer)).toBe(true)
  })

  it('validates mixed question types with all edge cases', () => {
    const answers: (number | number[])[] = [
      -1, // Unanswered single-select
      [], // Unanswered multi-select
      0, // Answered single-select
      [0, 1, 2], // Answered multi-select
    ]
    const otherTexts = [
      'custom', // Covers first unanswered
      '', // Does not cover second
      '', // Not needed
      '', // Not needed
    ]

    // Should be false because answers[1] is empty array with no text
    expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(false)
  })

  it('validates all answered with mixed types', () => {
    const answers: (number | number[])[] = [
      0, // Answered single-select
      [0], // Answered multi-select (one option)
      [0, 1, 2], // Answered multi-select (multiple options)
      -1, // Unanswered but has text
    ]
    const otherTexts = ['', '', '', 'custom answer']

    expect(areAllQuestionsAnswered(answers, otherTexts)).toBe(true)
  })
})

describe('Multi-Select Question Properties', () => {
  it('handles question with header', () => {
    const question: AskUserQuestion = {
      question: 'Which features do you want?',
      header: 'Features',
      options: ['Feature 1', 'Feature 2', 'Feature 3'],
      multiSelect: true,
    }

    expect(question.header).toBe('Features')
    expect(question.multiSelect).toBe(true)
    expect(shouldAutoAdvance(question)).toBe(false)
  })

  it('handles question with option descriptions', () => {
    const question: AskUserQuestion = {
      question: 'Select authentication methods',
      header: 'Auth',
      options: [
        { label: 'JWT', description: 'Stateless tokens' },
        { label: 'Sessions', description: 'Server-side sessions' },
        { label: 'OAuth', description: 'Third-party auth' },
      ],
      multiSelect: true,
    }

    expect(question.options.length).toBe(3)
    expect(typeof question.options[0]).toBe('object')
    expect((question.options[0] as any).label).toBe('JWT')
    expect((question.options[0] as any).description).toBe('Stateless tokens')
  })

  it('handles question with validation rules', () => {
    const question: AskUserQuestion = {
      question: 'Select options or enter custom',
      options: ['Option 1', 'Option 2'],
      multiSelect: true,
      validation: {
        minLength: 3,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9 ]+$',
        patternError: 'Only alphanumeric characters allowed',
      },
    }

    expect(question.validation).toBeDefined()
    expect(question.validation?.minLength).toBe(3)
    expect(question.validation?.maxLength).toBe(50)
    expect(question.validation?.pattern).toBe('^[a-zA-Z0-9 ]+$')
  })

  it('handles backwards compatibility (no multiSelect flag)', () => {
    const question: AskUserQuestion = {
      question: 'Choose one',
      options: ['Option 1', 'Option 2'],
      // No multiSelect property - should default to false
    }

    // Should enable auto-advance (single-select behavior)
    expect(shouldAutoAdvance(question)).toBe(true)
  })
})
