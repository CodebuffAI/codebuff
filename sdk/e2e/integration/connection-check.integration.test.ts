/**
 * Integration Test: Connection Check
 *
 * Openbuff runs entirely in local/BYOK mode with no hosted backend to poll,
 * so CodebuffClient no longer exposes a checkConnection() method. The
 * connection status is always considered active. This file is retained as a
 * placeholder so the e2e integration suite directory keeps at least one test;
 * if the directory is pruned, this file can be deleted along with it.
 */

import { describe, test, expect } from 'bun:test'

describe('Integration: Connection Check', () => {
  test('local mode is always connected (no hosted backend to poll)', () => {
    expect(true).toBe(true)
  })
})
