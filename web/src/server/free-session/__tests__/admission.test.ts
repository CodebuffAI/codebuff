import { beforeEach, describe, expect, test } from 'bun:test'

import { EXPIRY_SWEEP_THROTTLE_MS } from '../config'
import {
  __resetFreeSessionAdmissionForTests,
  maybeSweepExpired,
} from '../admission'

const NOW = new Date('2026-04-17T12:00:00Z')

describe('maybeSweepExpired', () => {
  beforeEach(() => {
    // Clear the module-level throttle state so each test starts fresh.
    __resetFreeSessionAdmissionForTests()
  })

  test('calls sweepExpired with the supplied now and graceMs', async () => {
    const calls: { now: Date; graceMs: number }[] = []
    await maybeSweepExpired({
      sweepExpired: async (now, graceMs) => {
        calls.push({ now, graceMs })
        return 0
      },
      graceMs: 1000,
      now: () => NOW,
    })
    expect(calls).toEqual([{ now: NOW, graceMs: 1000 }])
  })

  test('is throttled — a second call within the window does not sweep again', async () => {
    let sweepCalls = 0
    const deps = {
      sweepExpired: async () => {
        sweepCalls += 1
        return 0
      },
      graceMs: 1000,
      // Second call is well within EXPIRY_SWEEP_THROTTLE_MS of the first.
      now: () => new Date(NOW.getTime() + EXPIRY_SWEEP_THROTTLE_MS - 1),
    }
    await maybeSweepExpired({ ...deps, now: () => NOW })
    await maybeSweepExpired(deps)
    expect(sweepCalls).toBe(1)
  })

  test('sweeps again once the throttle window has elapsed', async () => {
    let sweepCalls = 0
    const sweepExpired = async () => {
      sweepCalls += 1
      return 0
    }
    await maybeSweepExpired({ sweepExpired, graceMs: 1000, now: () => NOW })
    await maybeSweepExpired({
      sweepExpired,
      graceMs: 1000,
      now: () => new Date(NOW.getTime() + EXPIRY_SWEEP_THROTTLE_MS),
    })
    expect(sweepCalls).toBe(2)
  })

  test('after __resetFreeSessionAdmissionForTests it sweeps again immediately', async () => {
    let sweepCalls = 0
    const sweepExpired = async () => {
      sweepCalls += 1
      return 0
    }
    await maybeSweepExpired({ sweepExpired, graceMs: 1000, now: () => NOW })
    // Without a reset this second call would be throttled.
    __resetFreeSessionAdmissionForTests()
    await maybeSweepExpired({ sweepExpired, graceMs: 1000, now: () => NOW })
    expect(sweepCalls).toBe(2)
  })

  test('never throws when sweepExpired rejects', async () => {
    await expect(
      maybeSweepExpired({
        sweepExpired: async () => {
          throw new Error('db down')
        },
        graceMs: 1000,
        now: () => NOW,
      }),
    ).resolves.toBeUndefined()
  })
})
