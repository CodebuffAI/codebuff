import { describe, test, expect, afterEach } from 'bun:test'

import { getSdkEnv } from '../env'
import { createTestSdkEnv } from '../testing/env'

describe('sdk/env', () => {
  describe('getSdkEnv', () => {
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

    test('returns current process.env values for base vars', () => {
      process.env.SHELL = '/bin/zsh'
      process.env.HOME = '/Users/testuser'
      const env = getSdkEnv()
      expect(env.SHELL).toBe('/bin/zsh')
      expect(env.HOME).toBe('/Users/testuser')
    })

    test('returns current process.env values for CODEBUFF_RG_PATH', () => {
      process.env.CODEBUFF_RG_PATH = '/path/to/rg'
      const env = getSdkEnv()
      expect(env.CODEBUFF_RG_PATH).toBe('/path/to/rg')
    })

    test('returns current process.env values for CODEBUFF_WASM_DIR', () => {
      process.env.CODEBUFF_WASM_DIR = '/path/to/wasm'
      const env = getSdkEnv()
      expect(env.CODEBUFF_WASM_DIR).toBe('/path/to/wasm')
    })

    test('returns current process.env values for build flags', () => {
      process.env.VERBOSE = 'true'
      process.env.OVERRIDE_TARGET = 'linux-x64'
      const env = getSdkEnv()
      expect(env.VERBOSE).toBe('true')
      expect(env.OVERRIDE_TARGET).toBe('linux-x64')
    })

    test('returns undefined for unset env vars', () => {
      delete process.env.CODEBUFF_RG_PATH
      delete process.env.CODEBUFF_WASM_DIR
      const env = getSdkEnv()
      expect(env.CODEBUFF_RG_PATH).toBeUndefined()
      expect(env.CODEBUFF_WASM_DIR).toBeUndefined()
    })

    test('returns a snapshot that does not change when process.env changes', () => {
      process.env.CODEBUFF_RG_PATH = '/original/path'
      const env = getSdkEnv()
      process.env.CODEBUFF_RG_PATH = '/new/path'
      expect(env.CODEBUFF_RG_PATH).toBe('/original/path')
    })
  })

  describe('createTestSdkEnv', () => {
    test('returns a SdkEnv with default test values', () => {
      const env = createTestSdkEnv()
      expect(env.HOME).toBe('/home/test')
      expect(env.NODE_ENV).toBe('test')
      expect(env.TERM).toBe('xterm-256color')
      expect(env.PATH).toBe('/usr/bin')
    })

    test('returns undefined for SDK-specific vars by default', () => {
      const env = createTestSdkEnv()
      expect(env.CODEBUFF_RG_PATH).toBeUndefined()
      expect(env.CODEBUFF_WASM_DIR).toBeUndefined()
      expect(env.VERBOSE).toBeUndefined()
      expect(env.OVERRIDE_TARGET).toBeUndefined()
    })

    test('allows overriding SDK-specific values', () => {
      const env = createTestSdkEnv({
        CODEBUFF_RG_PATH: '/custom/rg',
        CODEBUFF_WASM_DIR: '/custom/wasm',
      })
      expect(env.CODEBUFF_RG_PATH).toBe('/custom/rg')
      expect(env.CODEBUFF_WASM_DIR).toBe('/custom/wasm')
      // Other values should still have defaults
      expect(env.HOME).toBe('/home/test')
    })

    test('allows overriding build flags', () => {
      const env = createTestSdkEnv({
        VERBOSE: 'true',
        OVERRIDE_TARGET: 'darwin-arm64',
        OVERRIDE_PLATFORM: 'darwin',
        OVERRIDE_ARCH: 'arm64',
      })
      expect(env.VERBOSE).toBe('true')
      expect(env.OVERRIDE_TARGET).toBe('darwin-arm64')
      expect(env.OVERRIDE_PLATFORM).toBe('darwin')
      expect(env.OVERRIDE_ARCH).toBe('arm64')
    })

    test('allows overriding default values', () => {
      const env = createTestSdkEnv({
        HOME: '/custom/home',
        NODE_ENV: 'production',
      })
      expect(env.HOME).toBe('/custom/home')
      expect(env.NODE_ENV).toBe('production')
    })
  })
})
