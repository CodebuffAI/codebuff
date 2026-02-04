import { describe, expect, test } from 'bun:test'

import { ORG_BILLING_ENABLED } from '../billing-config'

describe('billing-config', () => {
  describe('ORG_BILLING_ENABLED', () => {
    test('is exported as a boolean', () => {
      expect(typeof ORG_BILLING_ENABLED).toBe('boolean')
    })

    test('is currently set to false (org billing disabled)', () => {
      // This test documents the current state of the feature flag.
      // When re-enabling org billing, update this test to expect true.
      expect(ORG_BILLING_ENABLED).toBe(false)
    })
  })
})
