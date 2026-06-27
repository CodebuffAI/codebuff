import { describe, test, expect } from 'bun:test'

import { useConnectionStatus } from '../use-connection-status'

/**
 * Tests for useConnectionStatus.
 *
 * Openbuff runs entirely in local/BYOK mode with no hosted backend to poll,
 * so the connection is always considered active and the reconnection callback
 * is never invoked. The adaptive health-check interval logic that used to
 * live here was removed along with checkConnection().
 */
describe('useConnectionStatus', () => {
  test('always reports connected in local/BYOK mode', () => {
    expect(useConnectionStatus()).toBe(true)
  })

  test('ignores the reconnection callback (no backend to reconnect to)', () => {
    const onReconnect = (): void => {
      throw new Error('should not be invoked in local mode')
    }
    expect(useConnectionStatus(onReconnect)).toBe(true)
  })
})
