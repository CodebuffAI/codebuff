import { describe, expect, test } from 'bun:test'

import {
  EXPIRY_SWEEP_THROTTLE_MS,
  getIpSessionCap,
  getSessionGraceMs,
  getSessionLengthMs,
  IP_SESSION_LOG_FLOOR,
  SESSION_GRACE_MS,
} from '../config'

describe('free session config', () => {
  test('session length is a positive duration', () => {
    expect(getSessionLengthMs()).toBeGreaterThan(0)
  })

  test('session grace matches the configured constant', () => {
    expect(getSessionGraceMs()).toBe(SESSION_GRACE_MS)
    expect(SESSION_GRACE_MS).toBeGreaterThan(0)
  })

  test('per-IP session cap is a positive ceiling', () => {
    expect(getIpSessionCap()).toBeGreaterThan(0)
  })

  test('expiry sweep throttle is a positive interval', () => {
    expect(EXPIRY_SWEEP_THROTTLE_MS).toBeGreaterThan(0)
  })

  test('per-IP log floor is a positive threshold', () => {
    expect(IP_SESSION_LOG_FLOOR).toBeGreaterThan(0)
  })
})
