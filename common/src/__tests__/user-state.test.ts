import { describe, test, expect } from 'bun:test'

import { getUserState, UserState } from '../old-constants'

describe('getUserState', () => {
  test('returns LOGGED_OUT for unauthenticated users regardless of credits', () => {
    expect(getUserState(false, 1000)).toBe(UserState.LOGGED_OUT)
    expect(getUserState(false, 0)).toBe(UserState.LOGGED_OUT)
  })

  test('returns GOOD_STANDING for users with >= 100 credits', () => {
    expect(getUserState(true, 100)).toBe(UserState.GOOD_STANDING)
    expect(getUserState(true, 500)).toBe(UserState.GOOD_STANDING)
  })

  test('returns ATTENTION_NEEDED for users with 20-99 credits', () => {
    expect(getUserState(true, 99)).toBe(UserState.ATTENTION_NEEDED)
    expect(getUserState(true, 20)).toBe(UserState.ATTENTION_NEEDED)
  })

  test('returns CRITICAL for users with 1-19 credits', () => {
    expect(getUserState(true, 19)).toBe(UserState.CRITICAL)
    expect(getUserState(true, 1)).toBe(UserState.CRITICAL)
  })

  test('returns DEPLETED for users with 0 or fewer credits', () => {
    expect(getUserState(true, 0)).toBe(UserState.DEPLETED)
    expect(getUserState(true, -100)).toBe(UserState.DEPLETED)
  })
})
