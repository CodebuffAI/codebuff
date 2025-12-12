import { describe, test, expect, afterEach } from 'bun:test'

import { getCiEnv, ciEnv, isCI, createTestCiEnv } from '../env-ci'

describe('env-ci', () => {
  describe('getCiEnv', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      // Restore original env
      Object.keys(process.env).forEach((key) => {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      })
      Object.assign(process.env, originalEnv)
    })

    test('returns current process.env values for CI', () => {
      process.env.CI = 'true'
      const env = getCiEnv()
      expect(env.CI).toBe('true')
    })

    test('returns current process.env values for GITHUB_ACTIONS', () => {
      process.env.GITHUB_ACTIONS = 'true'
      const env = getCiEnv()
      expect(env.GITHUB_ACTIONS).toBe('true')
    })

    test('returns current process.env values for CODEBUFF_API_KEY', () => {
      process.env.CODEBUFF_API_KEY = 'test-key-123'
      const env = getCiEnv()
      expect(env.CODEBUFF_API_KEY).toBe('test-key-123')
    })

    test('returns current process.env values for CODEBUFF_GITHUB_TOKEN', () => {
      process.env.CODEBUFF_GITHUB_TOKEN = 'ghp_test_token'
      const env = getCiEnv()
      expect(env.CODEBUFF_GITHUB_TOKEN).toBe('ghp_test_token')
    })

    test('returns undefined for unset env vars', () => {
      delete process.env.RENDER
      const env = getCiEnv()
      expect(env.RENDER).toBeUndefined()
    })

    test('returns a snapshot that does not change when process.env changes', () => {
      process.env.CI = 'true'
      const env = getCiEnv()
      process.env.CI = 'false'
      // The snapshot should still have the old value
      expect(env.CI).toBe('true')
    })
  })

  describe('ciEnv', () => {
    test('is a CiEnv object', () => {
      expect(ciEnv).toBeDefined()
      expect(typeof ciEnv).toBe('object')
    })

    test('contains expected keys', () => {
      expect('CI' in ciEnv).toBe(true)
      expect('GITHUB_ACTIONS' in ciEnv).toBe(true)
      expect('CODEBUFF_API_KEY' in ciEnv).toBe(true)
      expect('CODEBUFF_GITHUB_TOKEN' in ciEnv).toBe(true)
    })
  })

  describe('isCI', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      // Restore original env
      Object.keys(process.env).forEach((key) => {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      })
      Object.assign(process.env, originalEnv)
    })

    test('returns true when CI=true', () => {
      process.env.CI = 'true'
      delete process.env.GITHUB_ACTIONS
      expect(isCI()).toBe(true)
    })

    test('returns true when CI=1', () => {
      process.env.CI = '1'
      delete process.env.GITHUB_ACTIONS
      expect(isCI()).toBe(true)
    })

    test('returns true when GITHUB_ACTIONS=true', () => {
      delete process.env.CI
      process.env.GITHUB_ACTIONS = 'true'
      expect(isCI()).toBe(true)
    })

    test('returns false when neither CI nor GITHUB_ACTIONS is set', () => {
      delete process.env.CI
      delete process.env.GITHUB_ACTIONS
      expect(isCI()).toBe(false)
    })

    test('returns false when CI=false', () => {
      process.env.CI = 'false'
      delete process.env.GITHUB_ACTIONS
      expect(isCI()).toBe(false)
    })
  })

  describe('createTestCiEnv', () => {
    test('returns a CiEnv with default test values', () => {
      const env = createTestCiEnv()
      expect(env.CODEBUFF_API_KEY).toBe('test-api-key')
    })

    test('returns undefined for most vars by default', () => {
      const env = createTestCiEnv()
      expect(env.CI).toBeUndefined()
      expect(env.GITHUB_ACTIONS).toBeUndefined()
      expect(env.RENDER).toBeUndefined()
      expect(env.IS_PULL_REQUEST).toBeUndefined()
      expect(env.CODEBUFF_GITHUB_TOKEN).toBeUndefined()
    })

    test('allows overriding specific values', () => {
      const env = createTestCiEnv({
        CI: 'true',
        GITHUB_ACTIONS: 'true',
      })
      expect(env.CI).toBe('true')
      expect(env.GITHUB_ACTIONS).toBe('true')
      // Other values should still have defaults
      expect(env.CODEBUFF_API_KEY).toBe('test-api-key')
    })

    test('allows overriding default values', () => {
      const env = createTestCiEnv({
        CODEBUFF_API_KEY: 'custom-api-key',
      })
      expect(env.CODEBUFF_API_KEY).toBe('custom-api-key')
    })

    test('allows setting all CI-related vars for CI simulation', () => {
      const env = createTestCiEnv({
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        RENDER: 'true',
        IS_PULL_REQUEST: 'true',
        CODEBUFF_GITHUB_TOKEN: 'ghp_simulated_token',
        CODEBUFF_API_KEY: 'test-api-key-override',
      })
      expect(env.CI).toBe('true')
      expect(env.GITHUB_ACTIONS).toBe('true')
      expect(env.RENDER).toBe('true')
      expect(env.IS_PULL_REQUEST).toBe('true')
      expect(env.CODEBUFF_GITHUB_TOKEN).toBe('ghp_simulated_token')
      expect(env.CODEBUFF_API_KEY).toBe('test-api-key-override')
    })
  })
})
