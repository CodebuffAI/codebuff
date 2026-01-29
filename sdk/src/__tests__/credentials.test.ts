import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'node:path'
import os from 'os'

import {
  getConfigDir,
  getCredentialsPath,
  getUserCredentials,
  getClaudeOAuthCredentials,
  saveClaudeOAuthCredentials,
  clearClaudeOAuthCredentials,
  isClaudeOAuthValid,
  refreshClaudeOAuthToken,
  getValidClaudeOAuthCredentials,
  userFromJson,
  type ClaudeOAuthCredentials,
} from '../credentials'

// Need to import to check env var name
import { CLAUDE_OAUTH_TOKEN_ENV_VAR } from '@codebuff/common/constants/claude-oauth'

describe('credentials', () => {
  const testEnv = {
    NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  } as const

  describe('getConfigDir', () => {
    test('returns path with environment suffix for non-prod environments', () => {
      const dir = getConfigDir(testEnv as any)
      expect(dir).toContain('manicode-test')
      expect(dir).toContain('.config')
    })

    test('returns path without suffix for prod environment', () => {
      const prodEnv = { NEXT_PUBLIC_CB_ENVIRONMENT: 'prod' }
      const dir = getConfigDir(prodEnv as any)
      expect(dir).toContain('manicode')
      expect(dir).not.toContain('manicode-prod')
    })

    test('returns path without suffix when environment is undefined', () => {
      const emptyEnv = {}
      const dir = getConfigDir(emptyEnv as any)
      expect(dir).toContain('manicode')
      expect(dir).not.toContain('manicode-')
    })
  })

  describe('getCredentialsPath', () => {
    test('returns path within config directory', () => {
      const credPath = getCredentialsPath(testEnv as any)
      expect(credPath).toContain('credentials.json')
      expect(credPath).toContain('manicode-test')
    })
  })

  describe('userFromJson', () => {
    test('returns null for invalid JSON', () => {
      const user = userFromJson('not valid json')
      expect(user).toBeNull()
    })

    test('returns null for missing default user', () => {
      const json = JSON.stringify({ claudeOAuth: { accessToken: 'test' } })
      const user = userFromJson(json)
      expect(user).toBeNull()
    })

    test('returns null for empty object', () => {
      const user = userFromJson('{}')
      expect(user).toBeNull()
    })
  })

  describe('getUserCredentials', () => {
    test('returns null when credentials file does not exist', () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'nonexistent' } as any
      const user = getUserCredentials(env)
      expect(user).toBeNull()
    })
  })

  describe('getClaudeOAuthCredentials', () => {
    test('returns null when no credentials exist', () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'nonexistent-env' } as any
      const creds = getClaudeOAuthCredentials(env)
      expect(creds).toBeNull()
    })

    test('returns credentials from environment variable when set', () => {
      const originalToken = process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
      process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = 'env-token-123'

      try {
        const creds = getClaudeOAuthCredentials(testEnv as any)
        expect(creds).not.toBeNull()
        expect(creds?.accessToken).toBe('env-token-123')
        expect(creds?.refreshToken).toBe('')
        expect(creds?.expiresAt).toBeGreaterThan(Date.now())
      } finally {
        if (originalToken) {
          process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })

    test('environment variable takes precedence over file', () => {
      const originalToken = process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
      process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = 'env-token-override'

      // Create temp credentials file
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'))
      const credentials = {
        claudeOAuth: {
          accessToken: 'file-token',
          refreshToken: 'refresh-123',
          expiresAt: Date.now() + 3600000,
          connectedAt: Date.now(),
        },
      }

      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      const configDir = getConfigDir(env)
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

      try {
        const creds = getClaudeOAuthCredentials(env)
        expect(creds?.accessToken).toBe('env-token-override')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        if (originalToken) {
          process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })
  })

  describe('saveClaudeOAuthCredentials', () => {
    test('saves credentials to file', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const newCreds: ClaudeOAuthCredentials = {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresAt: Date.now() + 3600000,
          connectedAt: Date.now(),
        }

        saveClaudeOAuthCredentials(newCreds, env)

        const configDir = getConfigDir(env)
        const content = fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8')
        const parsed = JSON.parse(content)

        expect(parsed.claudeOAuth.accessToken).toBe('new-access')
        expect(parsed.claudeOAuth.refreshToken).toBe('new-refresh')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('preserves existing user credentials when saving OAuth', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        // First save user credentials
        const initialContent = {
          default: {
            userId: 'user-789',
            email: 'user@test.com',
            token: 'user-token',
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(initialContent))

        // Then save OAuth credentials
        const newCreds: ClaudeOAuthCredentials = {
          accessToken: 'oauth-access',
          refreshToken: 'oauth-refresh',
          expiresAt: Date.now() + 3600000,
          connectedAt: Date.now(),
        }

        saveClaudeOAuthCredentials(newCreds, env)

        const content = fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8')
        const parsed = JSON.parse(content)

        expect(parsed.default.userId).toBe('user-789')
        expect(parsed.claudeOAuth.accessToken).toBe('oauth-access')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })

  describe('clearClaudeOAuthCredentials', () => {
    test('removes OAuth credentials from file', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          default: { userId: 'user-1', email: 'test@test.com', token: 'token' },
          claudeOAuth: {
            accessToken: 'oauth-token',
            refreshToken: 'refresh',
            expiresAt: Date.now() + 3600000,
            connectedAt: Date.now(),
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        clearClaudeOAuthCredentials(env)

        const content = fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8')
        const parsed = JSON.parse(content)

        expect(parsed.claudeOAuth).toBeUndefined()
        expect(parsed.default.userId).toBe('user-1')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('handles missing credentials file gracefully', () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'nonexistent-clear' } as any
      // Should not throw
      clearClaudeOAuthCredentials(env)
    })
  })

  describe('isClaudeOAuthValid', () => {
    test('returns false when no credentials exist', () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'novalid-env' } as any
      const valid = isClaudeOAuthValid(env)
      expect(valid).toBe(false)
    })

    test('returns true for valid non-expiring credentials', () => {
      const originalToken = process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
      process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = 'valid-token'

      try {
        const valid = isClaudeOAuthValid(testEnv as any)
        expect(valid).toBe(true)
      } finally {
        if (originalToken) {
          process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })

    test('returns false for expired credentials', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expired-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'expired-token',
            refreshToken: 'refresh',
            expiresAt: Date.now() - 1000, // Expired 1 second ago
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const valid = isClaudeOAuthValid(env)
        expect(valid).toBe(false)
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('returns false for credentials expiring within 5 minutes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buffer-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'almost-expired',
            refreshToken: 'refresh',
            expiresAt: Date.now() + 3 * 60 * 1000, // Expires in 3 minutes
            connectedAt: Date.now(),
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const valid = isClaudeOAuthValid(env)
        expect(valid).toBe(false)
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })

  describe('refreshClaudeOAuthToken', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('returns null when no credentials exist', async () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'norefresh-env' } as any
      const result = await refreshClaudeOAuthToken(env)
      expect(result).toBeNull()
    })

    test('returns null when no refresh token available', async () => {
      const originalToken = process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
      process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = 'no-refresh-token'

      try {
        const result = await refreshClaudeOAuthToken(testEnv as any)
        expect(result).toBeNull()
      } finally {
        if (originalToken) {
          process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })

    test('successfully refreshes token', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'old-access',
            refreshToken: 'refresh-token-123',
            expiresAt: Date.now() - 1000,
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const mockFetch = mock(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_in: 3600,
              }),
          } as Response),
        )
        globalThis.fetch = mockFetch as unknown as typeof fetch

        const result = await refreshClaudeOAuthToken(env)

        expect(result).not.toBeNull()
        expect(result?.accessToken).toBe('new-access-token')
        expect(result?.refreshToken).toBe('new-refresh-token')
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Verify the saved credentials
        const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8'))
        expect(saved.claudeOAuth.accessToken).toBe('new-access-token')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        globalThis.fetch = originalFetch
      }
    })

    test('clears credentials and returns null on refresh failure', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fail-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'old-access',
            refreshToken: 'invalid-refresh',
            expiresAt: Date.now() - 1000,
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const mockFetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 400,
          } as Response),
        )
        globalThis.fetch = mockFetch as unknown as typeof fetch

        const result = await refreshClaudeOAuthToken(env)

        expect(result).toBeNull()
        // Credentials should be cleared
        const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8'))
        expect(saved.claudeOAuth).toBeUndefined()
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        globalThis.fetch = originalFetch
      }
    })

    test('uses mutex to prevent concurrent refresh attempts', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutex-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'old-access',
            refreshToken: 'refresh-token-mutex',
            expiresAt: Date.now() - 1000,
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        let callCount = 0
        const mockFetch = mock(() => {
          callCount++
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'new-token',
                refresh_token: 'new-refresh',
                expires_in: 3600,
              }),
          } as Response)
        })
        globalThis.fetch = mockFetch as unknown as typeof fetch

        // Start multiple concurrent refreshes
        const [result1, result2, result3] = await Promise.all([
          refreshClaudeOAuthToken(env),
          refreshClaudeOAuthToken(env),
          refreshClaudeOAuthToken(env),
        ])

        // All should get the same result
        expect(result1?.accessToken).toBe('new-token')
        expect(result2?.accessToken).toBe('new-token')
        expect(result3?.accessToken).toBe('new-token')

        // But fetch should only be called once due to mutex
        expect(callCount).toBe(1)
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('getValidClaudeOAuthCredentials', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('returns null when no credentials exist', async () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'no-creds' } as any
      const result = await getValidClaudeOAuthCredentials(env)
      expect(result).toBeNull()
    })

    test('returns env var credentials without refresh', async () => {
      const originalToken = process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
      process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = 'env-valid-token'

      try {
        const result = await getValidClaudeOAuthCredentials(testEnv as any)
        expect(result?.accessToken).toBe('env-valid-token')
      } finally {
        if (originalToken) {
          process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })

    test('returns valid file credentials immediately', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-creds-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'valid-file-token',
            refreshToken: 'refresh',
            expiresAt: Date.now() + 3600000, // Valid for 1 hour
            connectedAt: Date.now(),
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const result = await getValidClaudeOAuthCredentials(env)

        expect(result?.accessToken).toBe('valid-file-token')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('refreshes expired credentials', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-expired-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'expired-token',
            refreshToken: 'valid-refresh',
            expiresAt: Date.now() - 1000, // Expired
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const mockFetch = mock(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'refreshed-token',
                refresh_token: 'new-refresh',
                expires_in: 3600,
              }),
          } as Response),
        )
        globalThis.fetch = mockFetch as unknown as typeof fetch

        const result = await getValidClaudeOAuthCredentials(env)

        expect(result?.accessToken).toBe('refreshed-token')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        globalThis.fetch = originalFetch
      }
    })

    test('returns null when refresh fails', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fail-valid-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          claudeOAuth: {
            accessToken: 'expired-token',
            refreshToken: 'invalid-refresh',
            expiresAt: Date.now() - 1000, // Expired
            connectedAt: Date.now() - 7200000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const mockFetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 400,
          } as Response),
        )
        globalThis.fetch = mockFetch as unknown as typeof fetch

        const result = await getValidClaudeOAuthCredentials(env)

        expect(result).toBeNull()
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
        globalThis.fetch = originalFetch
      }
    })
  })
})
