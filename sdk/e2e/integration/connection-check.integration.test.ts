/**
 * Integration Test: Connection Check
 *
 * Tests the checkConnection() method of CodebuffClient.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { getApiKey, ensureBackendConnection } from '../utils'

describe('Integration: Connection Check', () => {
  let client: CodebuffClient

  beforeAll(() => {
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  beforeEach(async () => {
    await ensureBackendConnection()
  })

  test('checkConnection returns true when backend is reachable', async () => {

    const isConnected = await client.checkConnection()
    expect(isConnected).toBe(true)
  })

  test('checkConnection returns boolean', async () => {

    const result = await client.checkConnection()
    expect(typeof result).toBe('boolean')
  })
})
