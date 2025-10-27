import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  getAuthTokenDetails,
  saveUserCredentials,
  type User,
} from '../../utils/auth'
import { validateApiKey } from '../../hooks/use-auth-query'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'

const RETURNING_USER: User = {
  id: 'returning-user-456',
  name: 'Returning User',
  email: 'returning@example.com',
  authToken: 'valid-session-token-xyz',
  fingerprintId: 'returning-fingerprint',
  fingerprintHash: 'returning-hash',
}

const createLogger = (): Logger & Record<string, ReturnType<typeof mock>> => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
})

describe('Returning User Authentication helpers', () => {
  const originalEnv: Record<string, string | undefined> = {}
  let tempConfigDir: string

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manicode-returning-'))
    originalEnv.CODEBUFF_API_KEY = process.env.CODEBUFF_API_KEY
  })

  afterEach(() => {
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true })
    }
    process.env.CODEBUFF_API_KEY = originalEnv.CODEBUFF_API_KEY
    mock.restore()
  })

  test('should load auth token from credentials file for returning user', () => {
    const authModule = require('../../utils/auth') as typeof import('../../utils/auth')

    spyOn(authModule, 'getConfigDir').mockReturnValue(tempConfigDir)
    spyOn(authModule, 'getCredentialsPath').mockReturnValue(
      path.join(tempConfigDir, 'credentials.json'),
    )

    saveUserCredentials(RETURNING_USER)

    const details = getAuthTokenDetails()
    expect(details.source).toBe('credentials')
    expect(details.token).toBe(RETURNING_USER.authToken)
  })

  test('should fall back to CODEBUFF_API_KEY when credentials are missing', () => {
    const authModule = require('../../utils/auth') as typeof import('../../utils/auth')

    spyOn(authModule, 'getConfigDir').mockReturnValue(tempConfigDir)
    spyOn(authModule, 'getCredentialsPath').mockReturnValue(
      path.join(tempConfigDir, 'credentials.json'),
    )

    process.env.CODEBUFF_API_KEY = 'env-token-123'

    const details = getAuthTokenDetails()
    expect(details.source).toBe('environment')
    expect(details.token).toBe('env-token-123')
  })

  test('should validate stored credentials without blocking the UI thread', async () => {
    const authModule = require('../../utils/auth') as typeof import('../../utils/auth')

    spyOn(authModule, 'getConfigDir').mockReturnValue(tempConfigDir)
    spyOn(authModule, 'getCredentialsPath').mockReturnValue(
      path.join(tempConfigDir, 'credentials.json'),
    )

    saveUserCredentials(RETURNING_USER)

    const logger = createLogger()
    const mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn = mock(async () => ({
      id: RETURNING_USER.id,
      email: RETURNING_USER.email,
    })) as GetUserInfoFromApiKeyFn

    const result = await validateApiKey({
      apiKey: RETURNING_USER.authToken,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger,
    })

    expect(result).toEqual({
      id: RETURNING_USER.id,
      email: RETURNING_USER.email,
    })
    expect(mockGetUserInfoFromApiKey).toHaveBeenCalledTimes(1)
  })
})
