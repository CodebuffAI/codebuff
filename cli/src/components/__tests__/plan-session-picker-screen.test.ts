import { describe, expect, it } from 'bun:test'

import { getNextPlanSessionFocusIndex } from '../plan-session-picker-screen'

/**
 * Unit tests for PlanSessionPickerScreen component logic.
 *
 * Note: These tests focus on the data/logic layer since React component
 * rendering with OpenTUI is difficult to test in isolation. The component
 * behavior is tested through integration tests.
 */
describe('PlanSessionPickerScreen', () => {
  describe('getNextPlanSessionFocusIndex', () => {
    it('keeps focus at 0 when there are no filtered sessions', () => {
      expect(getNextPlanSessionFocusIndex(0, 0)).toBe(0)
    })

    it('recovers invalid negative focus when there are no filtered sessions', () => {
      expect(getNextPlanSessionFocusIndex(-1, 0)).toBe(0)
    })

    it('moves focus down until the last filtered session', () => {
      expect(getNextPlanSessionFocusIndex(0, 3)).toBe(1)
      expect(getNextPlanSessionFocusIndex(1, 3)).toBe(2)
      expect(getNextPlanSessionFocusIndex(2, 3)).toBe(2)
    })

    it('does not focus beyond the rendered session limit', () => {
      expect(getNextPlanSessionFocusIndex(498, 1000)).toBe(499)
      expect(getNextPlanSessionFocusIndex(499, 1000)).toBe(499)
    })
  })
})
