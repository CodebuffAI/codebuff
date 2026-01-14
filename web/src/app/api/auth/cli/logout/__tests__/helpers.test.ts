import { describe, expect, test } from 'bun:test'

import { shouldUnclaim } from '../_helpers'

describe('logout/_helpers', () => {
  describe('shouldUnclaim', () => {
    describe('when fingerprintMatchFound is true', () => {
      test('returns true regardless of hash values', () => {
        expect(shouldUnclaim(true, 'stored-hash', 'provided-hash')).toBe(true)
        expect(shouldUnclaim(true, null, 'provided-hash')).toBe(true)
        expect(shouldUnclaim(true, undefined, 'provided-hash')).toBe(true)
        expect(shouldUnclaim(true, 'any-hash', 'different-hash')).toBe(true)
      })
    })

    describe('when fingerprintMatchFound is false', () => {
      test('returns true when stored hash matches provided hash', () => {
        expect(shouldUnclaim(false, 'matching-hash', 'matching-hash')).toBe(true)
      })

      test('returns false when stored hash does not match provided hash', () => {
        expect(shouldUnclaim(false, 'stored-hash', 'different-hash')).toBe(false)
      })

      test('returns false when stored hash is null', () => {
        expect(shouldUnclaim(false, null, 'provided-hash')).toBe(false)
      })

      test('returns false when stored hash is undefined', () => {
        expect(shouldUnclaim(false, undefined, 'provided-hash')).toBe(false)
      })

      test('returns false when stored hash is empty string but provided is not', () => {
        expect(shouldUnclaim(false, '', 'provided-hash')).toBe(false)
      })

      test('returns true when both hashes are empty strings', () => {
        expect(shouldUnclaim(false, '', '')).toBe(true)
      })
    })
  })
})
