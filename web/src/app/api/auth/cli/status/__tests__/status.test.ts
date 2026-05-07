import { genAuthCode } from '@codebuff/common/util/credentials'
import { createMockLogger } from '@codebuff/common/testing/mock-types'
import { describe, expect, mock, test } from 'bun:test'

import { getLoginStatus } from '../_get'

import type { LoginStatusDb } from '../_get'

const secret = 'test-secret'
const fingerprintId = 'enhanced-fingerprint'
const expiresAt = '2000000'

function createRequest(hash: string): Request {
  const params = new URLSearchParams({
    fingerprintId,
    fingerprintHash: hash,
    expiresAt,
  })
  return new Request(`http://localhost/api/auth/cli/status?${params}`)
}

describe('/api/auth/cli/status', () => {
  test('returns the CLI session bound to the current login hash even when an older hash exists', async () => {
    const currentHash = genAuthCode(fingerprintId, expiresAt, secret)
    const oldHash = genAuthCode(fingerprintId, '1000000', secret)
    const getCliSessionForAuth = mock(
      async (requestedFingerprintId: string, requestedHash: string) => {
        const sessions = [
          {
            fingerprintId,
            cliAuthHash: oldHash,
            type: 'cli',
            user: {
              id: 'old-user',
              email: 'old@example.com',
              name: 'Old User',
              authToken: 'old-token',
            },
          },
          {
            fingerprintId,
            cliAuthHash: currentHash,
            type: 'cli',
            user: {
              id: 'new-user',
              email: 'new@example.com',
              name: 'New User',
              authToken: 'new-token',
            },
          },
        ]

        return (
          sessions.find(
            (session) =>
              session.fingerprintId === requestedFingerprintId &&
              session.cliAuthHash === requestedHash &&
              session.type === 'cli',
          )?.user ?? null
        )
      },
    )

    const response = await getLoginStatus({
      req: createRequest(currentHash),
      db: { getCliSessionForAuth } satisfies LoginStatusDb,
      logger: createMockLogger(),
      secret,
      now: () => 1000000,
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user.authToken).toBe('new-token')
    expect(getCliSessionForAuth).toHaveBeenCalledWith(
      fingerprintId,
      currentHash,
    )
  })

  test('rejects a wrong login hash', async () => {
    const getCliSessionForAuth = mock(async () => ({
      id: 'user',
      email: 'user@example.com',
      name: 'User',
      authToken: 'token',
    }))

    const response = await getLoginStatus({
      req: createRequest('wrong-hash'),
      db: { getCliSessionForAuth } satisfies LoginStatusDb,
      logger: createMockLogger(),
      secret,
      now: () => 1000000,
    })

    expect(response.status).toBe(401)
    expect(getCliSessionForAuth).not.toHaveBeenCalled()
  })

  test('does not authenticate a linked web session', async () => {
    const currentHash = genAuthCode(fingerprintId, expiresAt, secret)
    const getCliSessionForAuth = mock(async () => null)

    const response = await getLoginStatus({
      req: createRequest(currentHash),
      db: { getCliSessionForAuth } satisfies LoginStatusDb,
      logger: createMockLogger(),
      secret,
      now: () => 1000000,
    })

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ error: 'Authentication failed' })
  })

  test('returns 400 for malformed expiresAt', async () => {
    const params = new URLSearchParams({
      fingerprintId,
      fingerprintHash: 'hash',
      expiresAt: 'not-a-number',
    })
    const getCliSessionForAuth = mock(async () => null)

    const response = await getLoginStatus({
      req: new Request(`http://localhost/api/auth/cli/status?${params}`),
      db: { getCliSessionForAuth } satisfies LoginStatusDb,
      logger: createMockLogger(),
      secret,
      now: () => 1000000,
    })

    expect(response.status).toBe(400)
    expect(getCliSessionForAuth).not.toHaveBeenCalled()
  })
})
