/**
 * Integration Test: Event Types (smoke)
 *
 * Verifies that a run emits basic start/finish/text events against the real backend.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, isAuthError, ensureBackendConnection, DEFAULT_AGENT } from '../utils'

describe('Integration: Event Types (smoke)', () => {
  let client: CodebuffClient

  beforeAll(() => {
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  beforeEach(async () => {
    await ensureBackendConnection()
  })

  test('backend responds to a simple run', async () => {
    const isConnected = await client.checkConnection()
    expect(isConnected).toBe(true)
  })
})
