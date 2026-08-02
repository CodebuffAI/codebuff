import { describe, expect, test, mock, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'node:path'
import os from 'os'

import {
  getConfigDir,
  getCredentialsPath,
  getUserCredentials,
  userFromJson,
} from '../credentials'

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
      const json = JSON.stringify({ someOtherKey: { accessToken: 'test' } })
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
})
