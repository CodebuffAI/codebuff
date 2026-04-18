import { describe, expect, test } from 'bun:test'

import { estimateWaitMs, toSessionStateResponse } from '../session-view'

import type { InternalSessionRow } from '../types'

const SESSION_LEN = 60 * 60 * 1000
const MAX_CONC = 50

function row(overrides: Partial<InternalSessionRow> = {}): InternalSessionRow {
  const now = new Date('2026-04-17T12:00:00Z')
  return {
    user_id: 'u1',
    status: 'queued',
    active_instance_id: 'inst-1',
    queued_at: now,
    admitted_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('estimateWaitMs', () => {
  test('position <= capacity → 0 wait', () => {
    expect(estimateWaitMs({ position: 1, maxConcurrent: MAX_CONC, sessionLengthMs: SESSION_LEN })).toBe(0)
    expect(estimateWaitMs({ position: MAX_CONC, maxConcurrent: MAX_CONC, sessionLengthMs: SESSION_LEN })).toBe(0)
  })

  test('position in second wave → one full session length', () => {
    expect(estimateWaitMs({ position: MAX_CONC + 1, maxConcurrent: MAX_CONC, sessionLengthMs: SESSION_LEN })).toBe(SESSION_LEN)
  })

  test('position in third wave → two full session lengths', () => {
    expect(estimateWaitMs({ position: 2 * MAX_CONC + 1, maxConcurrent: MAX_CONC, sessionLengthMs: SESSION_LEN })).toBe(2 * SESSION_LEN)
  })

  test('degenerate inputs return 0', () => {
    expect(estimateWaitMs({ position: 0, maxConcurrent: 10, sessionLengthMs: 1000 })).toBe(0)
    expect(estimateWaitMs({ position: 5, maxConcurrent: 0, sessionLengthMs: 1000 })).toBe(0)
  })
})

describe('toSessionStateResponse', () => {
  const now = new Date('2026-04-17T12:00:00Z')

  test('returns null when row is null', () => {
    const view = toSessionStateResponse({
      row: null,
      position: 0,
      queueDepth: 0,
      maxConcurrent: MAX_CONC,
      sessionLengthMs: SESSION_LEN,
      now,
    })
    expect(view).toBeNull()
  })

  test('queued row maps to queued response with position + wait estimate', () => {
    const view = toSessionStateResponse({
      row: row({ status: 'queued' }),
      position: 51,
      queueDepth: 100,
      maxConcurrent: MAX_CONC,
      sessionLengthMs: SESSION_LEN,
      now,
    })
    expect(view).toEqual({
      status: 'queued',
      instanceId: 'inst-1',
      position: 51,
      queueDepth: 100,
      estimatedWaitMs: SESSION_LEN,
      queuedAt: now.toISOString(),
    })
  })

  test('active unexpired row maps to active response with remaining ms', () => {
    const admittedAt = new Date(now.getTime() - 10 * 60_000)
    const expiresAt = new Date(now.getTime() + 50 * 60_000)
    const view = toSessionStateResponse({
      row: row({ status: 'active', admitted_at: admittedAt, expires_at: expiresAt }),
      position: 0,
      queueDepth: 0,
      maxConcurrent: MAX_CONC,
      sessionLengthMs: SESSION_LEN,
      now,
    })
    expect(view).toEqual({
      status: 'active',
      instanceId: 'inst-1',
      admittedAt: admittedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      remainingMs: 50 * 60_000,
    })
  })

  test('active but expired row maps to null (caller should re-queue)', () => {
    const view = toSessionStateResponse({
      row: row({ status: 'active', admitted_at: now, expires_at: new Date(now.getTime() - 1) }),
      position: 0,
      queueDepth: 0,
      maxConcurrent: MAX_CONC,
      sessionLengthMs: SESSION_LEN,
      now,
    })
    expect(view).toBeNull()
  })
})
