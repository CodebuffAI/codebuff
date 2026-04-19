import { describe, expect, test } from 'bun:test'

import { estimateWaitMs, toSessionStateResponse } from '../session-view'

import type { InternalSessionRow } from '../types'

const TICK_MS = 15_000
const GRACE_MS = 30 * 60_000

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
  test('position 1 → 0 wait (next tick picks you up)', () => {
    expect(estimateWaitMs({ position: 1, admissionTickMs: TICK_MS })).toBe(0)
  })

  test('position N → (N-1) ticks ahead', () => {
    expect(estimateWaitMs({ position: 2, admissionTickMs: TICK_MS })).toBe(TICK_MS)
    expect(estimateWaitMs({ position: 10, admissionTickMs: TICK_MS })).toBe(9 * TICK_MS)
  })

  test('degenerate inputs return 0', () => {
    expect(estimateWaitMs({ position: 0, admissionTickMs: TICK_MS })).toBe(0)
    expect(estimateWaitMs({ position: 5, admissionTickMs: 0 })).toBe(0)
  })
})

describe('toSessionStateResponse', () => {
  const now = new Date('2026-04-17T12:00:00Z')
  const baseArgs = {
    admissionTickMs: TICK_MS,
    graceMs: GRACE_MS,
  }

  test('returns null when row is null', () => {
    const view = toSessionStateResponse({
      row: null,
      position: 0,
      queueDepth: 0,
      ...baseArgs,
      now,
    })
    expect(view).toBeNull()
  })

  test('queued row maps to queued response with position + wait estimate', () => {
    const view = toSessionStateResponse({
      row: row({ status: 'queued' }),
      position: 3,
      queueDepth: 10,
      ...baseArgs,
      now,
    })
    expect(view).toEqual({
      status: 'queued',
      instanceId: 'inst-1',
      position: 3,
      queueDepth: 10,
      estimatedWaitMs: 2 * TICK_MS,
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
      ...baseArgs,
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

  test('active row inside grace window maps to ended response (with grace timing)', () => {
    const admittedAt = new Date(now.getTime() - 65 * 60_000)
    const expiresAt = new Date(now.getTime() - 5 * 60_000) // 5 min past expiry
    const view = toSessionStateResponse({
      row: row({ status: 'active', admitted_at: admittedAt, expires_at: expiresAt }),
      position: 0,
      queueDepth: 0,
      ...baseArgs,
      now,
    })
    expect(view).toEqual({
      status: 'ended',
      instanceId: 'inst-1',
      admittedAt: admittedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      gracePeriodEndsAt: new Date(expiresAt.getTime() + GRACE_MS).toISOString(),
      gracePeriodRemainingMs: GRACE_MS - 5 * 60_000,
    })
  })

  test('active row past the grace window maps to null (caller should re-queue)', () => {
    const view = toSessionStateResponse({
      row: row({
        status: 'active',
        admitted_at: now,
        expires_at: new Date(now.getTime() - GRACE_MS - 1),
      }),
      position: 0,
      queueDepth: 0,
      ...baseArgs,
      now,
    })
    expect(view).toBeNull()
  })
})
