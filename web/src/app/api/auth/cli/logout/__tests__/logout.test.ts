/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postLogout } from '../_post'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { LogoutDb } from '../_post'

describe('/api/auth/cli/logout POST endpoint', () => {
  let mockLogger: Logger
  let mockDb: LogoutDb

  const testUserId = 'user-123'
  const testFingerprintId = 'fp-abc123'
  const testFingerprintHash = 'hash-xyz789'
  const testAuthToken = 'auth-token-456'
  const testFingerprintCreatedAt = new Date('2024-01-01T12:00:00Z')

  function createRequest(
    body: object,
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest('http://localhost:3000/api/auth/cli/logout', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }

  function createValidBody(overrides: object = {}) {
    return {
      userId: testUserId,
      fingerprintId: testFingerprintId,
      fingerprintHash: testFingerprintHash,
      ...overrides,
    }
  }

  function createBaseMockDb(): LogoutDb {
    return {
      getSessionByToken: mock(async () => [{ userId: testUserId }]),
      deleteSessionsByFingerprint: mock(async () => []),
      getFingerprintData: mock(async () => []),
      deleteOrphanedWebSessions: mock(async () => []),
      deleteWebSessionsInTimeWindow: mock(async () => []),
      deleteAllWebSessions: mock(async () => []),
      unclaimFingerprint: mock(async () => {}),
    }
  }

  // Setup mocks for fallback tests (fingerprint match returns nothing, fingerprint exists)
  function setupFallbackMocks(
    db: LogoutDb,
    sigHash: string | null = testFingerprintHash,
  ) {
    db.deleteSessionsByFingerprint = mock(async () => [])
    db.getFingerprintData = mock(async () => [
      { created_at: testFingerprintCreatedAt, sig_hash: sigHash },
    ])
  }

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    mockDb = createBaseMockDb()
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Request validation', () => {
    test('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/cli/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: 'not json',
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid request body' })
    })

    test('returns 400 when userId is missing', async () => {
      const req = createRequest(
        { fingerprintId: 'fp', fingerprintHash: 'hash' },
        { Authorization: 'Bearer test-token' },
      )

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid request body' })
    })

    test('returns 400 when fingerprintId is missing', async () => {
      const req = createRequest(
        { userId: 'user', fingerprintHash: 'hash' },
        { Authorization: 'Bearer test-token' },
      )

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid request body' })
    })

    test('returns 400 when fingerprintHash is missing', async () => {
      const req = createRequest(
        { userId: 'user', fingerprintId: 'fp' },
        { Authorization: 'Bearer test-token' },
      )

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid request body' })
    })
  })

  describe('Authentication', () => {
    test('returns 401 when no auth token is provided', async () => {
      const req = createRequest(createValidBody())

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })

    test('accepts auth token from Authorization header', async () => {
      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.getSessionByToken).toHaveBeenCalledWith(
        testAuthToken,
        testUserId,
      )
    })

    test('accepts auth token from x-codebuff-api-key header', async () => {
      const req = createRequest(createValidBody(), {
        'x-codebuff-api-key': testAuthToken,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.getSessionByToken).toHaveBeenCalledWith(
        testAuthToken,
        testUserId,
      )
    })

    test('accepts auth token from body (backwards compatibility)', async () => {
      const req = createRequest(createValidBody({ authToken: testAuthToken }))

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.getSessionByToken).toHaveBeenCalledWith(
        testAuthToken,
        testUserId,
      )
    })

    test('prefers Authorization header over body authToken', async () => {
      const headerToken = 'header-token'
      const bodyToken = 'body-token'

      const req = createRequest(createValidBody({ authToken: bodyToken }), {
        Authorization: `Bearer ${headerToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.getSessionByToken).toHaveBeenCalledWith(
        headerToken,
        testUserId,
      )
    })

    test('returns success when token is invalid/expired (no-op)', async () => {
      mockDb.getSessionByToken = mock(async () => [])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
      // Should not proceed to session deletion
      expect(mockDb.deleteSessionsByFingerprint).not.toHaveBeenCalled()
    })
  })

  describe('Fingerprint-based deletion (primary)', () => {
    test('deletes sessions by fingerprint match', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [
        { id: 'session-1' },
        { id: 'session-2' },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.deleteSessionsByFingerprint).toHaveBeenCalledWith(
        testUserId,
        testFingerprintId,
      )
      // Should not proceed to fallback, but should fetch fingerprint data for orphan cleanup
      expect(mockDb.getFingerprintData).toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).not.toHaveBeenCalled()
    })

    test('unclaims fingerprint when fingerprint match succeeds', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [
        { id: 'session-1' },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.unclaimFingerprint).toHaveBeenCalledWith(testFingerprintId)
    })

    test('cleans up orphaned web sessions after fingerprint match succeeds', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [
        { id: 'cli-session' },
      ])
      mockDb.deleteOrphanedWebSessions = mock(async () => [
        { id: 'orphan-web-session' },
      ])
      mockDb.getFingerprintData = mock(async () => [
        { created_at: testFingerprintCreatedAt, sig_hash: testFingerprintHash },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      // Should delete CLI session via fingerprint match
      expect(mockDb.deleteSessionsByFingerprint).toHaveBeenCalledWith(
        testUserId,
        testFingerprintId,
      )
      // Should also clean up orphaned web sessions (no timestamp filtering)
      expect(mockDb.deleteOrphanedWebSessions).toHaveBeenCalledWith(testUserId)
      // Should NOT use fallback deletion
      expect(mockDb.deleteAllWebSessions).not.toHaveBeenCalled()
    })
  })

  describe('Time-window deletion (intermediate strategy)', () => {
    beforeEach(() => {
      setupFallbackMocks(mockDb)
    })

    test('tries time-window deletion when fingerprint match fails but fingerprint data exists', async () => {
      mockDb.deleteWebSessionsInTimeWindow = mock(async () => [
        { id: 'web-in-window' },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.deleteWebSessionsInTimeWindow).toHaveBeenCalledWith(
        testUserId,
        testFingerprintCreatedAt,
      )
      // Should NOT proceed to nuclear fallback when time-window deletion succeeds
      expect(mockDb.deleteAllWebSessions).not.toHaveBeenCalled()
    })

    test('falls back to deleteAllWebSessions when time-window deletion finds nothing', async () => {
      mockDb.deleteWebSessionsInTimeWindow = mock(async () => [])
      mockDb.deleteAllWebSessions = mock(async () => [{ id: 'web-1' }])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.deleteWebSessionsInTimeWindow).toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).toHaveBeenCalledWith(testUserId)
    })
  })

  describe('Final fallback deletion: All web sessions', () => {
    test('proceeds directly to nuclear fallback when no fingerprint data exists', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [])
      mockDb.getFingerprintData = mock(async () => [])
      mockDb.deleteAllWebSessions = mock(async () => [{ id: 'web-1' }])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.deleteWebSessionsInTimeWindow).not.toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).toHaveBeenCalledWith(testUserId)
    })

    test('proceeds directly to nuclear fallback when fingerprint has no created_at', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [])
      mockDb.getFingerprintData = mock(async () => [
        { created_at: null as unknown as Date, sig_hash: testFingerprintHash },
      ])
      mockDb.deleteAllWebSessions = mock(async () => [{ id: 'web-1' }])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      expect(mockDb.deleteWebSessionsInTimeWindow).not.toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).toHaveBeenCalledWith(testUserId)
    })
  })

  describe('Fingerprint unclaim security', () => {
    test('unclaims when fingerprint match succeeds (ownership via session)', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [
        { id: 'session-1' },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).toHaveBeenCalledWith(testFingerprintId)
    })

    test('unclaims when hash matches (fallback path)', async () => {
      setupFallbackMocks(mockDb)

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).toHaveBeenCalledWith(testFingerprintId)
    })

    test('does NOT unclaim when hash mismatches', async () => {
      setupFallbackMocks(mockDb, 'different-hash')

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).not.toHaveBeenCalled()
    })

    test('does NOT unclaim when fingerprint not found', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [])
      mockDb.getFingerprintData = mock(async () => [])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).not.toHaveBeenCalled()
    })

    test('does NOT unclaim when sig_hash is null', async () => {
      setupFallbackMocks(mockDb, null)

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).not.toHaveBeenCalled()
    })

    test('prevents malicious unclaim with wrong hash', async () => {
      // Attacker passes victim's fingerprintId with wrong hash
      setupFallbackMocks(mockDb, 'victim-secret-hash')

      const req = createRequest(
        createValidBody({ fingerprintHash: 'attacker-guessed-hash' }),
        { Authorization: `Bearer ${testAuthToken}` },
      )

      await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(mockDb.unclaimFingerprint).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    test('returns 500 when database operation fails', async () => {
      mockDb.getSessionByToken = mock(async () => {
        throw new Error('Database connection failed')
      })

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
      expect(mockLogger.error).toHaveBeenCalled()
    })

    test('returns 500 when fingerprint deletion fails', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => {
        throw new Error('Delete failed')
      })

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(500)
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('Full flow integration', () => {
    test('fingerprint match success: deletes sessions, runs orphan cleanup, unclaims, skips fallbacks', async () => {
      mockDb.deleteSessionsByFingerprint = mock(async () => [
        { id: 'cli-session' },
      ])
      mockDb.deleteOrphanedWebSessions = mock(async () => [
        { id: 'orphan-web-session' },
      ])
      mockDb.getFingerprintData = mock(async () => [
        { created_at: testFingerprintCreatedAt, sig_hash: testFingerprintHash },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody).toEqual({ success: true })
      expect(mockDb.deleteSessionsByFingerprint).toHaveBeenCalled()
      expect(mockDb.unclaimFingerprint).toHaveBeenCalled()
      // Should run orphan cleanup after fingerprint match success
      expect(mockDb.deleteOrphanedWebSessions).toHaveBeenCalledWith(testUserId)
      // Should NOT use intermediate or nuclear fallback
      expect(mockDb.deleteWebSessionsInTimeWindow).not.toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).not.toHaveBeenCalled()
    })

    test('time-window deletion success: deletes sessions, unclaims, skips nuclear fallback', async () => {
      setupFallbackMocks(mockDb)
      mockDb.deleteWebSessionsInTimeWindow = mock(async () => [
        { id: 'web-in-window' },
      ])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody).toEqual({ success: true })
      expect(mockDb.deleteWebSessionsInTimeWindow).toHaveBeenCalled()
      expect(mockDb.unclaimFingerprint).toHaveBeenCalled()
      expect(mockDb.deleteAllWebSessions).not.toHaveBeenCalled()
    })

    test('nuclear fallback with hash mismatch: deletes all sessions, does NOT unclaim', async () => {
      setupFallbackMocks(mockDb, 'different-hash')
      mockDb.deleteWebSessionsInTimeWindow = mock(async () => [])
      mockDb.deleteAllWebSessions = mock(async () => [{ id: 'web-1' }])

      const req = createRequest(createValidBody(), {
        Authorization: `Bearer ${testAuthToken}`,
      })

      const response = await postLogout({ req, db: mockDb, logger: mockLogger })

      expect(response.status).toBe(200)
      const responseBody = await response.json()
      expect(responseBody).toEqual({ success: true })
      expect(mockDb.deleteAllWebSessions).toHaveBeenCalled()
      expect(mockDb.unclaimFingerprint).not.toHaveBeenCalled()
    })
  })
})
