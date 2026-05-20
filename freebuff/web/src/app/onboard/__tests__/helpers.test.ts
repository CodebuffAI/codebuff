import { genAuthCode } from '@codebuff/common/util/credentials'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  buildCliAuthCode,
  getCliAuthCodeHashPrefix,
  getCliAuthCodeTokenIdentifier,
  getConsumedCliAuthCodeTokenIdentifier,
  getConsumedCliAuthCodeTokenValue,
  isAuthCodeExpired,
  isCliAuthCodeCandidate,
  isOpaqueCliAuthCodeToken,
  parseAuthCode,
  resolveCliAuthCode,
  validateAuthCode,
} from '../_helpers'

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

    test('parses legacy hyphen-delimited auth code', () => {
      const receivedHash = 'a'.repeat(64)
      const authCode = `1234567890abcdef1234567890abcdef-1704067200000-${receivedHash}`
      const result = parseAuthCode(authCode)

      expect(result.fingerprintId).toBe('1234567890abcdef1234567890abcdef')
      expect(result.expiresAt).toBe('1704067200000')
      expect(result.receivedHash).toBe(receivedHash)
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

  describe('opaque CLI auth code tokens', () => {
    const testSecret = 'test-secret-key'
    const testFingerprintId = 'fp-abc123'

    test('builds the signed auth code payload', () => {
      expect(buildCliAuthCode('fingerprint-id', '1704067200000', 'hash')).toBe(
        'fingerprint-id.1704067200000.hash',
      )
    })

    test('identifies 43 character base64url browser tokens only', () => {
      const opaqueToken = 'A'.repeat(41) + '-_'
      const signedAuthCode = buildCliAuthCode(
        testFingerprintId,
        '1704067200000',
        'a'.repeat(64),
      )

      expect(isOpaqueCliAuthCodeToken(opaqueToken)).toBe(true)
      expect(isOpaqueCliAuthCodeToken(` ${opaqueToken}\n`)).toBe(true)
      expect(isOpaqueCliAuthCodeToken(signedAuthCode)).toBe(false)
      expect(isOpaqueCliAuthCodeToken('A'.repeat(42))).toBe(false)
      expect(isOpaqueCliAuthCodeToken(`${'A'.repeat(42)}.`)).toBe(false)
    })

    test('identifies auth code candidates by supported shapes', () => {
      const opaqueToken = 'A'.repeat(41) + '-_'
      const signedAuthCode = buildCliAuthCode(
        testFingerprintId,
        '1704067200000',
        'a'.repeat(64),
      )
      const legacyAuthCode = `1234567890abcdef-1704067200000-${'b'.repeat(
        64,
      )}`

      expect(isCliAuthCodeCandidate(opaqueToken)).toBe(true)
      expect(isCliAuthCodeCandidate(signedAuthCode)).toBe(true)
      expect(isCliAuthCodeCandidate(legacyAuthCode)).toBe(true)
      expect(isCliAuthCodeCandidate(crypto.randomUUID())).toBe(false)
      expect(isCliAuthCodeCandidate('F0xe_Mt2yA2az_LUXGxlBsGDIgJ')).toBe(false)
      expect(
        isCliAuthCodeCandidate(
          buildCliAuthCode(testFingerprintId, 'not-a-number', 'a'.repeat(64)),
        ),
      ).toBe(false)
      expect(
        isCliAuthCodeCandidate(
          buildCliAuthCode(testFingerprintId, '1704067200000', 'short-hash'),
        ),
      ).toBe(false)
    })

    test('hashes auth codes for log correlation without logging the token', () => {
      expect(getCliAuthCodeHashPrefix('a'.repeat(43))).toBe('66d34fba71f8')
      expect(getCliAuthCodeHashPrefix(` ${'a'.repeat(43)}\n`)).toBe(
        '66d34fba71f8',
      )
    })

    test('builds active and consumed token identifiers', () => {
      expect(getCliAuthCodeTokenIdentifier('token-123')).toBe(
        'cli-login:token-123',
      )
      expect(getConsumedCliAuthCodeTokenIdentifier('token-123')).toBe(
        'cli-login-consumed:034192845dc489deca291f9f5ae0bb8e5472c991020bf64b3ebc6dec5a1d7e47',
      )
      expect(getConsumedCliAuthCodeTokenValue()).toBe('consumed')
    })

    test('resolves an opaque browser token before validation', async () => {
      const expiresAt = '4102444800000'
      const fingerprintHash = genAuthCode(
        testFingerprintId,
        expiresAt,
        testSecret,
      )
      const signedAuthCode = buildCliAuthCode(
        testFingerprintId,
        expiresAt,
        fingerprintHash,
      )
      const opaqueToken = 'a'.repeat(43)

      const result = await resolveCliAuthCode(opaqueToken, async (token) => {
        expect(token).toBe(opaqueToken)
        return { status: 'resolved', authCode: signedAuthCode }
      })

      expect(result).toEqual({
        status: 'ready',
        authCode: signedAuthCode,
        resolvedOpaqueToken: true,
      })

      const parsed = parseAuthCode(result.authCode)
      expect(
        validateAuthCode(
          parsed.receivedHash,
          parsed.fingerprintId,
          parsed.expiresAt,
          testSecret,
        ).valid,
      ).toBe(true)
    })

    test('does not look up already signed auth codes', async () => {
      const signedAuthCode = buildCliAuthCode(
        testFingerprintId,
        '4102444800000',
        'a'.repeat(64),
      )
      let lookedUp = false

      const result = await resolveCliAuthCode(signedAuthCode, async () => {
        lookedUp = true
        return { status: 'missing' }
      })

      expect(lookedUp).toBe(false)
      expect(result).toEqual({
        status: 'ready',
        authCode: signedAuthCode,
        resolvedOpaqueToken: false,
      })
    })

    test('classifies reused opaque browser tokens as already consumed', async () => {
      const opaqueToken = 'c'.repeat(43)

      const result = await resolveCliAuthCode(opaqueToken, async (token) => {
        expect(token).toBe(opaqueToken)
        return { status: 'already_consumed' }
      })

      expect(result).toEqual({
        status: 'already_consumed',
        authCode: opaqueToken,
        resolvedOpaqueToken: false,
      })
    })

    test('keeps never-issued opaque browser tokens invalid', async () => {
      const opaqueToken = 'd'.repeat(43)

      const result = await resolveCliAuthCode(opaqueToken, async (token) => {
        expect(token).toBe(opaqueToken)
        return { status: 'missing' }
      })

      expect(result).toEqual({
        status: 'missing',
        authCode: opaqueToken,
        resolvedOpaqueToken: false,
      })
    })

    test('resolves expired stored payloads so callers can show expired', async () => {
      const expiresAt = '0'
      const fingerprintHash = genAuthCode(
        testFingerprintId,
        expiresAt,
        testSecret,
      )
      const signedAuthCode = buildCliAuthCode(
        testFingerprintId,
        expiresAt,
        fingerprintHash,
      )

      const result = await resolveCliAuthCode('b'.repeat(43), async () => ({
        status: 'resolved',
        authCode: signedAuthCode,
      }))
      const parsed = parseAuthCode(result.authCode)

      expect(isAuthCodeExpired(parsed.expiresAt)).toBe(true)
      expect(
        validateAuthCode(
          parsed.receivedHash,
          parsed.fingerprintId,
          parsed.expiresAt,
          testSecret,
        ).valid,
      ).toBe(true)
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
