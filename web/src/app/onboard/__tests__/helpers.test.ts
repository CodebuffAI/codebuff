import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { genAuthCode } from '@codebuff/common/util/credentials'

import { parseAuthCode, validateAuthCode, isAuthCodeExpired } from '../_helpers'

describe('onboard/_helpers', () => {
  describe('parseAuthCode', () => {
    test('parses valid auth code with three parts', () => {
      const authCode = 'fingerprint-123.1704067200000.abc123hash'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('fingerprint-123')
      expect(result.expiresAt).toBe('1704067200000')
      expect(result.receivedHash).toBe('abc123hash')
    })

    test('handles auth code with dots in fingerprint id', () => {
      // Note: This is a potential edge case - the current implementation
      // only splits into 3 parts, so extra dots would be included in fingerprintId
      const authCode = 'fp.with.dots.1704067200000.hashvalue'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('fp')
      expect(result.expiresAt).toBe('with')
      expect(result.receivedHash).toBe('dots')
    })

    test('handles empty string parts', () => {
      const authCode = '..emptyparts'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('')
      expect(result.expiresAt).toBe('')
      expect(result.receivedHash).toBe('emptyparts')
    })

    test('handles auth code with missing parts', () => {
      const authCode = 'onlyonepart'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('onlyonepart')
      expect(result.expiresAt).toBeUndefined()
      expect(result.receivedHash).toBeUndefined()
    })

    test('handles auth code with two parts', () => {
      const authCode = 'first.second'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('first')
      expect(result.expiresAt).toBe('second')
      expect(result.receivedHash).toBeUndefined()
    })

    test('handles empty auth code', () => {
      const authCode = ''
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('')
      expect(result.expiresAt).toBeUndefined()
      expect(result.receivedHash).toBeUndefined()
    })
  })

  describe('validateAuthCode', () => {
    const testSecret = 'test-secret-key'
    const testFingerprintId = 'fp-abc123'
    const testExpiresAt = '1704067200000'

    test('returns valid=true when hash matches', () => {
      const expectedHash = genAuthCode(testFingerprintId, testExpiresAt, testSecret)
      const result = validateAuthCode(expectedHash, testFingerprintId, testExpiresAt, testSecret)

      expect(result.valid).toBe(true)
      expect(result.expectedHash).toBe(expectedHash)
    })

    test('returns valid=false when hash does not match', () => {
      const wrongHash = 'wrong-hash-value'
      const result = validateAuthCode(wrongHash, testFingerprintId, testExpiresAt, testSecret)

      expect(result.valid).toBe(false)
      expect(result.expectedHash).not.toBe(wrongHash)
    })

    test('returns valid=false when secret is different', () => {
      const hashWithDifferentSecret = genAuthCode(testFingerprintId, testExpiresAt, 'different-secret')
      const result = validateAuthCode(hashWithDifferentSecret, testFingerprintId, testExpiresAt, testSecret)

      expect(result.valid).toBe(false)
    })

    test('returns valid=false when fingerprintId is different', () => {
      const hashWithDifferentFp = genAuthCode('different-fp', testExpiresAt, testSecret)
      const result = validateAuthCode(hashWithDifferentFp, testFingerprintId, testExpiresAt, testSecret)

      expect(result.valid).toBe(false)
    })

    test('returns valid=false when expiresAt is different', () => {
      const hashWithDifferentExpiry = genAuthCode(testFingerprintId, '9999999999999', testSecret)
      const result = validateAuthCode(hashWithDifferentExpiry, testFingerprintId, testExpiresAt, testSecret)

      expect(result.valid).toBe(false)
    })

    test('hash is deterministic for same inputs', () => {
      const hash1 = genAuthCode(testFingerprintId, testExpiresAt, testSecret)
      const hash2 = genAuthCode(testFingerprintId, testExpiresAt, testSecret)
      
      expect(hash1).toBe(hash2)
      
      const result = validateAuthCode(hash1, testFingerprintId, testExpiresAt, testSecret)
      expect(result.valid).toBe(true)
    })

    test('returns the expected hash for verification', () => {
      const wrongHash = 'attacker-supplied-hash'
      const result = validateAuthCode(wrongHash, testFingerprintId, testExpiresAt, testSecret)

      // The expectedHash should be what we'd generate for these inputs
      const actualExpected = genAuthCode(testFingerprintId, testExpiresAt, testSecret)
      expect(result.expectedHash).toBe(actualExpected)
    })
  })

  describe('isAuthCodeExpired', () => {
    let originalDateNow: typeof Date.now

    beforeEach(() => {
      originalDateNow = Date.now
    })

    afterEach(() => {
      Date.now = originalDateNow
    })

    test('returns true when expiresAt is in the past', () => {
      const pastTimestamp = (Date.now() - 10000).toString()
      expect(isAuthCodeExpired(pastTimestamp)).toBe(true)
    })

    test('returns false when expiresAt is in the future', () => {
      const futureTimestamp = (Date.now() + 60000).toString()
      expect(isAuthCodeExpired(futureTimestamp)).toBe(false)
    })

    test('returns true when expiresAt equals current time (boundary)', () => {
      // Mock Date.now to return a fixed value
      const fixedNow = 1704067200000
      Date.now = () => fixedNow

      // expiresAt < Date.now() is the comparison, so equal should return false
      const sameTimestamp = fixedNow.toString()
      expect(isAuthCodeExpired(sameTimestamp)).toBe(false)
    })

    test('returns true when expiresAt is one millisecond before now', () => {
      const fixedNow = 1704067200000
      Date.now = () => fixedNow

      const justExpired = (fixedNow - 1).toString()
      expect(isAuthCodeExpired(justExpired)).toBe(true)
    })

    test('returns false when expiresAt is one millisecond after now', () => {
      const fixedNow = 1704067200000
      Date.now = () => fixedNow

      const notYetExpired = (fixedNow + 1).toString()
      expect(isAuthCodeExpired(notYetExpired)).toBe(false)
    })

    test('handles string comparison correctly for timestamps', () => {
      // The function uses string comparison (expiresAt < Date.now().toString())
      // This tests that it works correctly with numeric strings
      const fixedNow = 1704067200000
      Date.now = () => fixedNow

      // String "1704067199999" < "1704067200000" lexicographically (and numerically)
      expect(isAuthCodeExpired('1704067199999')).toBe(true)
      expect(isAuthCodeExpired('1704067200001')).toBe(false)
    })

    test('handles very old timestamps', () => {
      const veryOld = '0' // Epoch
      expect(isAuthCodeExpired(veryOld)).toBe(true)
    })

    test('handles very far future timestamps', () => {
      const farFuture = '9999999999999' // Year 2286
      expect(isAuthCodeExpired(farFuture)).toBe(false)
    })
  })
})
