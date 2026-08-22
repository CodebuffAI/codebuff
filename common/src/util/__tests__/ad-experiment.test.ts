import { describe, expect, test } from 'bun:test'

import {
  IMPREZIA_EXPERIMENT_PERCENT,
  adExperimentArmForUser,
} from '../ad-experiment'

describe('imprezia experiment arm', () => {
  test('signed-out sessions stay in control', () => {
    for (const id of [null, undefined, '']) {
      expect(adExperimentArmForUser(id)).toBe('control')
    }
  })

  test('a user gets the same arm every time', () => {
    for (const id of ['abc', 'user-42', 'a-very-long-uuid-like-identifier']) {
      const first = adExperimentArmForUser(id)
      for (let i = 0; i < 20; i++) {
        expect(adExperimentArmForUser(id)).toBe(first)
      }
    }
  })

  test(`puts ~${IMPREZIA_EXPERIMENT_PERCENT}% of users in the arm`, () => {
    const N = 20_000
    let inArm = 0
    for (let i = 0; i < N; i++) {
      if (adExperimentArmForUser(`user-${i}`) === 'imprezia_first') inArm++
    }
    const percent = (inArm / N) * 100
    // FNV-1a over sequential ids is not a perfect uniform source, so allow a
    // point of slack rather than asserting an exact count.
    expect(percent).toBeGreaterThan(IMPREZIA_EXPERIMENT_PERCENT - 1.5)
    expect(percent).toBeLessThan(IMPREZIA_EXPERIMENT_PERCENT + 1.5)
  })
})
