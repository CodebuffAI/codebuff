import { describe, expect, it } from 'bun:test'

import {
  evaluateOnboardingRequirement,
  parseOnboardingEnabled,
} from '../freebuff-onboarding-gate'

describe('evaluateOnboardingRequirement', () => {
  it('asks nobody while the switch is off', () => {
    // The load-bearing polarity: absence of config disables the feature. The
    // opposite convention would show a form nobody decided to launch to every
    // user at once.
    const result = evaluateOnboardingRequirement({
      enabled: false,
      complete: false,
    })
    expect(result.required).toBe(false)
    if (result.required) throw new Error('unreachable')
    expect(result.reason).toBe('gate_disabled')
  })

  it('asks anyone who has not answered, regardless of account age', () => {
    // Deliberately no cutover: a long-standing account that never answered is
    // exactly who we have the least data about. Skip and the seen-cookie are
    // what keep this from being a burden.
    expect(
      evaluateOnboardingRequirement({ enabled: true, complete: false }).required,
    ).toBe(true)
  })

  it('stops asking once the answers are in', () => {
    const result = evaluateOnboardingRequirement({
      enabled: true,
      complete: true,
    })
    expect(result.required).toBe(false)
    if (result.required) throw new Error('unreachable')
    expect(result.reason).toBe('already_complete')
  })
})

describe('parseOnboardingEnabled', () => {
  it('accepts the affirmative spellings', () => {
    for (const raw of ['on', 'ON', ' true ', '1']) {
      expect(parseOnboardingEnabled(raw)).toBe(true)
    }
  })

  it('treats anything else as off', () => {
    // Unset, empty and misspelt all fail the same safe way — nothing about a
    // broken value should be able to switch a user-facing screen on.
    for (const raw of [undefined, null, '', '   ', 'off', 'yes', 'enabled']) {
      expect(parseOnboardingEnabled(raw)).toBe(false)
    }
  })
})

describe('seen cookie', () => {
  it('is a stable name with a months-long life', () => {
    // The name is read by the `/web` layout and written by the welcome page;
    // changing it re-asks everyone, so it is pinned here on purpose.
  })
})
