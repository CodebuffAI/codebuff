import { describe, expect, test } from 'bun:test'

import { IndexManager } from './index-manager'

describe('IndexManager.markStale', () => {
  test('exposes markStale without throwing and is idempotent', () => {
    // Disabled config keeps this hermetic (no filesystem walk/build).
    const mgr = IndexManager.getInstance('/tmp/openbuff-indexer-test-markstale', {
      enabled: false,
    })
    expect(typeof mgr.markStale).toBe('function')
    mgr.markStale()
    mgr.markStale()
    // A disabled manager never builds, so query stays not-ready.
    const result = mgr.query('anything')
    expect(result.ready).toBe(false)
    expect(result.results).toEqual([])
  })

  test('waitUntilReady resolves quickly for a disabled manager even after markStale', async () => {
    const mgr = IndexManager.getInstance('/tmp/openbuff-indexer-test-markstale-2', {
      enabled: false,
    })
    mgr.markStale()
    await mgr.waitUntilReady(50)
    expect(mgr.query('x').ready).toBe(false)
  })
})
