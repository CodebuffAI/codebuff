import { genAuthCode } from '@codebuff/common/util/credentials'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { parseAuthCode, validateAuthCode, isAuthCodeExpired } from '../_helpers'

describe('freebuff onboard/_helpers', () => {
  describe('parseAuthCode', () => {
    test('parses valid auth code with three parts', () => {
      const authCode = 'fingerprint-123.1704067200000.abc123hash'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('fingerprint-123')
      expect(result.expiresAt).toBe('1704067200000')
      expect(result.receivedHash).toBe('abc123hash')
    })

    test('handles auth code with dots in fingerprint id', () => {
      const authCode = 'fp.with.dots.1704067200000.hashvalue'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('fp.with.dots')
      expect(result.expiresAt).toBe('1704067200000')
      expect(result.receivedHash).toBe('hashvalue')
    })

    test('handles auth code missing separator before expiresAt', () => {
      const authCode =
        'fingerprint-1231704067200000.abc123hashabc123hashabc123hash'
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('')
      expect(result.expiresAt).toBe('')
      expect(result.receivedHash).toBe('')
    })
  })

  describe('validateAuthCode', () => {
    const testSecret = 'test-secret-key'
    const testFingerprintId = 'fp-abc123'
    const testExpiresAt = '1704067200000'

    test('returns valid=true when hash matches', () => {
      const expectedHash = genAuthCode(
        testFingerprintId,
        testExpiresAt,
        testSecret,
      )
      const result = validateAuthCode(
        expectedHash,
        testFingerprintId,
        testExpiresAt,
        testSecret,
      )

      expect(result.valid).toBe(true)
      expect(result.expectedHash).toBe(expectedHash)
    })

    test('returns valid=false when hash does not match', () => {
      const result = validateAuthCode(
        'wrong-hash-value',
        testFingerprintId,
        testExpiresAt,
        testSecret,
      )

      expect(result.valid).toBe(false)
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
      Date.now = () => 1704067200000
      expect(isAuthCodeExpired('1704067199999')).toBe(true)
    })

    test('returns false when expiresAt is in the future', () => {
      Date.now = () => 1704067200000
      expect(isAuthCodeExpired('1704067200001')).toBe(false)
    })

    test('treats malformed timestamps as expired', () => {
      expect(isAuthCodeExpired('not-a-number')).toBe(true)
    })
  })
})
