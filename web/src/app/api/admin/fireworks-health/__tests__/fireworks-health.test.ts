import { describe, expect, test } from 'bun:test'
import { NextResponse } from 'next/server'

import { getFireworksHealth } from '../_get'

import type { FireworksHealthSnapshot } from '@/server/fireworks-monitor/types'

function snapshot(
  overall: FireworksHealthSnapshot['overall'],
): FireworksHealthSnapshot {
  return {
    scrapedAt: 1000,
    ageMs: 0,
    overall,
    deployments: {},
    lastError: null,
  }
}

const allowAdmin = async () => ({ id: 'admin-user', email: 'admin@example.com' })
const forbidAdmin = async () =>
  NextResponse.json({ error: 'Forbidden - not an admin' }, { status: 403 })

describe('/api/admin/fireworks-health', () => {
  test('returns 403 when caller is not an admin', async () => {
    const response = await getFireworksHealth({
      getSnapshot: () => snapshot('healthy'),
      checkAdminAuth: forbidAdmin,
    })
    expect(response.status).toBe(403)
  })

  test('returns 200 with snapshot when overall is healthy', async () => {
    const response = await getFireworksHealth({
      getSnapshot: () => snapshot('healthy'),
      checkAdminAuth: allowAdmin,
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.overall).toBe('healthy')
  })

  test('returns 200 when degraded', async () => {
    const response = await getFireworksHealth({
      getSnapshot: () => snapshot('degraded'),
      checkAdminAuth: allowAdmin,
    })
    expect(response.status).toBe(200)
  })

  test('returns 200 when unknown (no scrape yet)', async () => {
    const response = await getFireworksHealth({
      getSnapshot: () => snapshot('unknown'),
      checkAdminAuth: allowAdmin,
    })
    expect(response.status).toBe(200)
  })

  test('returns 503 when overall is unhealthy', async () => {
    const response = await getFireworksHealth({
      getSnapshot: () => snapshot('unhealthy'),
      checkAdminAuth: allowAdmin,
    })
    expect(response.status).toBe(503)
  })
})
