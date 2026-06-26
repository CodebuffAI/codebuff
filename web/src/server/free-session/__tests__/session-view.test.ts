import { describe, expect, test } from 'bun:test'

import { toSessionStateResponse } from '../session-view'

import type { InternalSessionRow } from '../types'

const GRACE_MS = 30 * 60_000

const TEST_MODEL = 'deepseek/deepseek-v4-pro'

function row(overrides: Partial<InternalSessionRow> = {}): InternalSessionRow {
  const now = new Date('2026-04-17T12:00:00Z')
  return {
    user_id: 'u1',
    status: 'queued',
    active_instance_id: 'inst-1',
    model: TEST_MODEL,
    queued_at: now,
    admitted_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('toSessionStateResponse', () => {
  const now = new Date('2026-04-17T12:00:00Z')
  const baseArgs = {
    graceMs: GRACE_MS,
  }

  test('returns null when row is null', () => {
    const view = toSessionStateResponse({
      row: null,
      ...baseArgs,
      now,
    })
    expect(view).toBeNull()
  })

  test('transient queued row maps to null (never surfaced to the wire)', () => {
    const view = toSessionStateResponse({
      row: row({ status: 'queued' }),
      ...baseArgs,
      now,
    })
    expect(view).toBeNull()
  })

  test('active unexpired row maps to active response with remaining ms', () => {
    const admittedAt = new Date(now.getTime() - 10 * 60_000)
    const expiresAt = new Date(now.getTime() + 50 * 60_000)
    const view = toSessionStateResponse({
      row: row({
        status: 'active',
        admitted_at: admittedAt,
        expires_at: expiresAt,
      }),
      ...baseArgs,
      now,
    })
    expect(view).toEqual({
      status: 'active',
      accessTier: 'full',
      instanceId: 'inst-1',
      model: TEST_MODEL,
      admittedAt: admittedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      remainingMs: 50 * 60_000,
    })
  })

  test('active row inside grace window maps to ended response (with grace timing)', () => {
    const admittedAt = new Date(now.getTime() - 65 * 60_000)
    const expiresAt = new Date(now.getTime() - 5 * 60_000) // 5 min past expiry
    const view = toSessionStateResponse({
      row: row({
        status: 'active',
        admitted_at: admittedAt,
        expires_at: expiresAt,
      }),
      ...baseArgs,
      now,
    })
    expect(view).toEqual({
      status: 'ended',
      accessTier: 'full',
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
      ...baseArgs,
      now,
    })
    expect(view).toBeNull()
  })
})
