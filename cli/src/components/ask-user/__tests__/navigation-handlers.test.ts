/**
 * Unit tests for navigation-handlers.ts
 * Testing pure functions for navigation logic
 */

import { describe, it, expect } from 'bun:test'
import {
  calculateNextQuestionIndex,
  calculateNextOptionIndex,
  getNextFocusUp,
  getNextFocusDown,
  getNextFocusTab,
  getFocusForQuestion,
  getNextFocusOnNavigation,
  shouldAutoAdvance,
} from '../utils/navigation-handlers'
import {
  createOptionFocus,
  createTextInputFocus,
  createSkipFocus,
} from '../types'
import type { NavigationContext } from '../types'

describe('calculateNextQuestionIndex', () => {
  describe('navigating forward (next)', () => {
    it('moves to next question', () => {
      expect(calculateNextQuestionIndex(0, 'next', 5, false)).toBe(1)
      expect(calculateNextQuestionIndex(2, 'next', 5, false)).toBe(3)
    })

    it('stays on last question when wrap disabled', () => {
      expect(calculateNextQuestionIndex(4, 'next', 5, false)).toBe(4)
    })

    it('wraps to first question when wrap enabled', () => {
      expect(calculateNextQuestionIndex(4, 'next', 5, true)).toBe(0)
    })
  })

  describe('navigating backward (prev)', () => {
    it('moves to previous question', () => {
      expect(calculateNextQuestionIndex(4, 'prev', 5, false)).toBe(3)
      expect(calculateNextQuestionIndex(2, 'prev', 5, false)).toBe(1)
    })

    it('stays on first question when wrap disabled', () => {
      expect(calculateNextQuestionIndex(0, 'prev', 5, false)).toBe(0)
    })

    it('wraps to last question when wrap enabled', () => {
      expect(calculateNextQuestionIndex(0, 'prev', 5, true)).toBe(4)
    })
  })
})

describe('calculateNextOptionIndex', () => {
  describe('navigating up', () => {
    it('moves to previous option', () => {
      expect(calculateNextOptionIndex(3, 'up', 5, false)).toBe(2)
      expect(calculateNextOptionIndex(1, 'up', 5, false)).toBe(0)
    })

    it('stays on first option when wrap disabled', () => {
      expect(calculateNextOptionIndex(0, 'up', 5, false)).toBe(0)
    })

    it('wraps to last option when wrap enabled', () => {
      expect(calculateNextOptionIndex(0, 'up', 5, true)).toBe(4)
    })
  })

  describe('navigating down', () => {
    it('moves to next option', () => {
      expect(calculateNextOptionIndex(0, 'down', 5, false)).toBe(1)
      expect(calculateNextOptionIndex(2, 'down', 5, false)).toBe(3)
    })

    it('stays on last option when wrap disabled', () => {
      expect(calculateNextOptionIndex(4, 'down', 5, false)).toBe(4)
    })

    it('wraps to first option when wrap enabled', () => {
      expect(calculateNextOptionIndex(4, 'down', 5, true)).toBe(0)
    })
  })
})

describe('getNextFocusUp', () => {
  const context: NavigationContext = {
    currentQuestionIndex: 0,
    totalQuestions: 3,
    currentQuestion: { question: 'Test?', options: ['A', 'B', 'C'] },
    wrapQuestions: false,
    wrapOptions: false,
  }

  it('moves from skip to text input', () => {
    const current = createSkipFocus()
    const next = getNextFocusUp(current, context)
    expect(next.type).toBe('textInput')
    expect(next).toEqual(createTextInputFocus(0))
  })

  it('moves from text input to last option', () => {
    const current = createTextInputFocus(0)
    const next = getNextFocusUp(current, context)
    expect(next.type).toBe('option')
    expect(next).toEqual(createOptionFocus(0, 2)) // Last option (index 2)
  })

  it('moves from option to previous option', () => {
    const current = createOptionFocus(0, 2)
    const next = getNextFocusUp(current, context)
    expect(next.type).toBe('option')
    expect(next).toEqual(createOptionFocus(0, 1))
  })

  it('stays on first option when at top and wrap disabled', () => {
    const current = createOptionFocus(0, 0)
    const next = getNextFocusUp(current, context)
    expect(next).toEqual(current) // Stays at first option
  })

  it('wraps from first option to last when wrap enabled', () => {
    const contextWithWrap = { ...context, wrapOptions: true }
    const current = createOptionFocus(0, 0)
    const next = getNextFocusUp(current, contextWithWrap)
    expect(next).toEqual(createOptionFocus(0, 2)) // Wraps to last
  })
})

describe('getNextFocusDown', () => {
  const context: NavigationContext = {
    currentQuestionIndex: 0,
    totalQuestions: 3,
    currentQuestion: { question: 'Test?', options: ['A', 'B', 'C'] },
    wrapQuestions: false,
    wrapOptions: false,
  }

  it('moves from skip to first option', () => {
    const current = createSkipFocus()
    const next = getNextFocusDown(current, context)
    expect(next.type).toBe('option')
    expect(next).toEqual(createOptionFocus(0, 0))
  })

  it('moves from text input to skip', () => {
    const current = createTextInputFocus(0)
    const next = getNextFocusDown(current, context)
    expect(next.type).toBe('skip')
  })

  it('moves from option to next option', () => {
    const current = createOptionFocus(0, 0)
    const next = getNextFocusDown(current, context)
    expect(next.type).toBe('option')
    expect(next).toEqual(createOptionFocus(0, 1))
  })

  it('moves from last option to text input', () => {
    const current = createOptionFocus(0, 2) // Last option
    const next = getNextFocusDown(current, context)
    expect(next.type).toBe('textInput')
    expect(next).toEqual(createTextInputFocus(0))
  })
})

describe('getNextFocusTab', () => {
  const context: NavigationContext = {
    currentQuestionIndex: 0,
    totalQuestions: 3,
    currentQuestion: { question: 'Test?', options: ['A', 'B', 'C'] },
    wrapQuestions: false,
    wrapOptions: false,
  }

  it('cycles from option to text input', () => {
    const current = createOptionFocus(0, 1)
    const next = getNextFocusTab(current, context)
    expect(next.type).toBe('textInput')
  })

  it('cycles from text input to skip', () => {
    const current = createTextInputFocus(0)
    const next = getNextFocusTab(current, context)
    expect(next.type).toBe('skip')
  })

  it('cycles from skip back to first option', () => {
    const current = createSkipFocus()
    const next = getNextFocusTab(current, context)
    expect(next.type).toBe('option')
    expect(next).toEqual(createOptionFocus(0, 0))
  })

  it('completes full cycle: option -> text -> skip -> option', () => {
    let focus = createOptionFocus(0, 0)
    focus = getNextFocusTab(focus, context) // -> text input
    expect(focus.type).toBe('textInput')
    focus = getNextFocusTab(focus, context) // -> skip
    expect(focus.type).toBe('skip')
    focus = getNextFocusTab(focus, context) // -> option
    expect(focus).toEqual(createOptionFocus(0, 0))
  })
})

describe('getFocusForQuestion', () => {
  it('returns focus on first option of specified question', () => {
    expect(getFocusForQuestion(0)).toEqual(createOptionFocus(0, 0))
    expect(getFocusForQuestion(2)).toEqual(createOptionFocus(2, 0))
    expect(getFocusForQuestion(5)).toEqual(createOptionFocus(5, 0))
  })
})

describe('getNextFocusOnNavigation', () => {
  const context: NavigationContext = {
    currentQuestionIndex: 0,
    totalQuestions: 3,
    currentQuestion: { question: 'Test?', options: ['A', 'B', 'C'] },
    wrapQuestions: false,
    wrapOptions: false,
  }

  it('handles up navigation', () => {
    const current = createOptionFocus(0, 1)
    const next = getNextFocusOnNavigation(current, 'up', context)
    expect(next).toEqual(createOptionFocus(0, 0))
  })

  it('handles down navigation', () => {
    const current = createOptionFocus(0, 1)
    const next = getNextFocusOnNavigation(current, 'down', context)
    expect(next).toEqual(createOptionFocus(0, 2))
  })

  it('handles tab navigation', () => {
    const current = createOptionFocus(0, 1)
    const next = getNextFocusOnNavigation(current, 'tab', context)
    expect(next.type).toBe('textInput')
  })

  it('returns current focus for left/right (handled elsewhere)', () => {
    const current = createOptionFocus(0, 1)
    expect(getNextFocusOnNavigation(current, 'left', context)).toEqual(current)
    expect(getNextFocusOnNavigation(current, 'right', context)).toEqual(current)
  })
})

describe('shouldAutoAdvance', () => {
  it('returns true for single-select questions (Phase 1)', () => {
    const question = { question: 'Test?', options: ['A', 'B'] }
    expect(shouldAutoAdvance(question)).toBe(true)
  })

  // Phase 2: Will test multi-select returns false
  // it('returns false for multi-select questions', () => {
  //   const question = { question: 'Test?', options: ['A', 'B'], multiSelect: true }
  //   expect(shouldAutoAdvance(question)).toBe(false)
  // })
})
