import { describe, expect, test, mock, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'node:path'
import os from 'os'

import {
  getConfigDir,
  getCredentialsPath,
  getUserCredentials,
  getChatGptOAuthCredentials,
  saveChatGptOAuthCredentials,
  clearChatGptOAuthCredentials,
  isChatGptOAuthValid,
  refreshChatGptOAuthToken,
  getValidChatGptOAuthCredentials,
  userFromJson,
  type ChatGptOAuthCredentials,
} from '../credentials'

// Need to import to check env var name
import { CHATGPT_OAUTH_TOKEN_ENV_VAR } from '@codebuff/common/constants/chatgpt-oauth'

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
      const json = JSON.stringify({ chatgptOAuth: { accessToken: 'test' } })
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

  describe('getChatGptOAuthCredentials', () => {
    test('returns null when no credentials exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-nocreds-'))
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'chatgpt-nonexistent-env' } as any
        const creds = getChatGptOAuthCredentials(env)
        expect(creds).toBeNull()
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('returns credentials from environment variable when set', () => {
      const originalToken = process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR]
      process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR] = 'chatgpt-env-token-123'

      try {
        const creds = getChatGptOAuthCredentials(testEnv as any)
        expect(creds).not.toBeNull()
        expect(creds?.accessToken).toBe('chatgpt-env-token-123')
        expect(creds?.refreshToken).toBe('')
        expect(creds?.expiresAt).toBeGreaterThan(Date.now())
      } finally {
        if (originalToken) {
          process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR] = originalToken
        } else {
          delete process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR]
        }
      }
    })
  })

  describe('save/clear ChatGPT OAuth credentials', () => {
    test('saves and clears ChatGPT OAuth credentials while preserving user credentials', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-save-clear-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const initial = {
          default: {
            userId: 'user-chatgpt',
            email: 'user-chatgpt@test.com',
            token: 'token-chatgpt',
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(initial))

        const newCreds: ChatGptOAuthCredentials = {
          accessToken: 'chatgpt-access',
          refreshToken: 'chatgpt-refresh',
          expiresAt: Date.now() + 3_600_000,
          connectedAt: Date.now(),
        }

        saveChatGptOAuthCredentials(newCreds, env)

        let parsed = JSON.parse(
          fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8'),
        )
        expect(parsed.default.userId).toBe('user-chatgpt')
        expect(parsed.chatgptOAuth.accessToken).toBe('chatgpt-access')

        clearChatGptOAuthCredentials(env)

        parsed = JSON.parse(
          fs.readFileSync(path.join(configDir, 'credentials.json'), 'utf8'),
        )
        expect(parsed.chatgptOAuth).toBeUndefined()
        expect(parsed.default.userId).toBe('user-chatgpt')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })

  describe('isChatGptOAuthValid', () => {
    test('returns false when no credentials exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-novalid-'))
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'chatgpt-novalid-env' } as any
        const valid = isChatGptOAuthValid(env)
        expect(valid).toBe(false)
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })

  describe('refreshChatGptOAuthToken', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('returns null when no credentials exist', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-norefresh-'))
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'chatgpt-norefresh-env' } as any
        const result = await refreshChatGptOAuthToken(env)
        expect(result).toBeNull()
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    test('successfully refreshes token', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-refresh-test-'))
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'test' } as any
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const configDir = getConfigDir(env)
        fs.mkdirSync(configDir, { recursive: true })

        const credentials = {
          chatgptOAuth: {
            accessToken: 'old-chatgpt-access',
            refreshToken: 'chatgpt-refresh-token-123',
            expiresAt: Date.now() - 1_000,
            connectedAt: Date.now() - 7_200_000,
          },
        }
        fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(credentials))

        const mockFetch = mock(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'new-chatgpt-access-token',
                refresh_token: 'new-chatgpt-refresh-token',
                expires_in: 3600,
              }),
          } as Response),
        )
        globalThis.fetch = mockFetch as unknown as typeof fetch

        const result = await refreshChatGptOAuthToken(env)

        expect(result).not.toBeNull()
        expect(result?.accessToken).toBe('new-chatgpt-access-token')
        expect(result?.refreshToken).toBe('new-chatgpt-refresh-token')
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })

  describe('getValidChatGptOAuthCredentials', () => {
    test('returns null when no credentials exist', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-nocreds2-'))
      const originalHomedir = os.homedir
      ;(os as any).homedir = () => tmpDir

      try {
        const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'chatgpt-no-creds' } as any
        const result = await getValidChatGptOAuthCredentials(env)
        expect(result).toBeNull()
      } finally {
        ;(os as any).homedir = originalHomedir
        fs.rmSync(tmpDir, { recursive: true })
      }
    })
  })
})
