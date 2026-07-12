import { describe, expect, test } from 'bun:test'

import { assertExpectedRevision } from '../types/harness-control-plane'

describe('harness control plane', () => {
  test('accepts matching compare-and-swap revisions', () => {
    expect(() => assertExpectedRevision(4, 4)).not.toThrow()
  })

  test('rejects stale writers', () => {
    expect(() => assertExpectedRevision(5, 4)).toThrow(
      'expected 4, current 5',
    )
  })
})
