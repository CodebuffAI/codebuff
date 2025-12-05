import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import {
  saveUserCredentials,
  getUserCredentials,
  logoutUser,
} from '../../utils/auth'
import { setProjectRoot } from '../../project-files'

import type * as AuthModule from '../../utils/auth'

type User = AuthModule.User

const ORIGINAL_USER: User = {
  id: 'user-001',
  name: 'CLI Tester',
  email: 'tester@codebuff.dev',
  authToken: 'token-original',
  fingerprintId: 'fingerprint-original',
  fingerprintHash: 'fingerprint-hash-original',
}

const RELOGIN_USER: User = {
  ...ORIGINAL_USER,
  authToken: 'token-after-relogin',
  fingerprintId: 'fingerprint-new',
  fingerprintHash: 'fingerprint-hash-new',
}

describe('Logout and Re-login helpers', () => {
  let tempConfigDir: string

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manicode-logout-'))
    // Set project root to avoid "Project root not set" error in logger
    setProjectRoot(tempConfigDir)
  })

  afterEach(() => {
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true })
    }
    mock.restore()
  })

  const mockConfigPaths = () => {
    const authModule = require('../../utils/auth') as typeof AuthModule
    spyOn(authModule, 'getConfigDir').mockReturnValue(tempConfigDir)
    spyOn(authModule, 'getCredentialsPath').mockReturnValue(
      path.join(tempConfigDir, 'credentials.json'),
    )
  }

  test('logoutUser removes credentials file and returns true', async () => {
    mockConfigPaths()
    saveUserCredentials(ORIGINAL_USER)

    const credentialsPath = path.join(tempConfigDir, 'credentials.json')
    expect(fs.existsSync(credentialsPath)).toBe(true)

    const result = await logoutUser()
    expect(result).toBe(true)
    expect(fs.existsSync(credentialsPath)).toBe(false)
  })

  test('re-login can persist new credentials after logout', async () => {
    mockConfigPaths()

    saveUserCredentials(ORIGINAL_USER)
    const firstLoaded = getUserCredentials()
    expect(firstLoaded?.authToken).toBe('token-original')

    await logoutUser()
    expect(getUserCredentials()).toBeNull()

    saveUserCredentials(RELOGIN_USER)
    const reloaded = getUserCredentials()
    expect(reloaded?.authToken).toBe('token-after-relogin')
    expect(reloaded?.fingerprintId).toBe('fingerprint-new')
  })

  test('logoutUser is idempotent when credentials are already missing', async () => {
    mockConfigPaths()

    const resultFirst = await logoutUser()
    expect(resultFirst).toBe(true)

    const resultSecond = await logoutUser()
    expect(resultSecond).toBe(true)
  })
})
