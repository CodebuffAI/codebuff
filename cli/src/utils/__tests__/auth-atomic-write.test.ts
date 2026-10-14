import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import { setProjectRoot } from '../../project-files'
import * as authModule from '../auth'
import {
  clearUserCredentials,
  getUserCredentials,
  saveUserCredentials,
} from '../auth'

import type { User } from '../auth'

/**
 * `credentials.json` is rewritten while other processes are reading it.
 *
 * Every running CLI calls `getUserCredentials()` from its render body, and
 * the public SDK reads the same file, so a non-atomic rewrite (truncate, then
 * write) hands a concurrent reader a truncated file and reads a signed-in
 * user as signed out. These tests pin the two properties that stop that: the
 * destination is only ever replaced whole, and a write that fails leaves the
 * previous file exactly as it was.
 */

const TEST_USER: User = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com',
  authToken: 'test-session-token-abc',
}

describe('credentials.json is replaced atomically', () => {
  let tempRoot: string
  let configDir: string
  let credentialsPath: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-cred-atomic-'))
    configDir = path.join(tempRoot, 'config')
    credentialsPath = path.join(configDir, 'credentials.json')
    setProjectRoot(tempRoot)
    spyOn(authModule, 'getConfigDir').mockReturnValue(configDir)
    spyOn(authModule, 'getCredentialsPath').mockReturnValue(credentialsPath)
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    mock.restore()
  })

  test('a concurrent reader never sees a half-written file on save', () => {
    fs.mkdirSync(configDir, { recursive: true })
    const previous = { default: { ...TEST_USER, email: 'old@example.com' } }
    fs.writeFileSync(credentialsPath, JSON.stringify(previous, null, 2))

    // Stand in for the other CLI process. `writeFileSync` is synchronous, so
    // the hook lands the instant the new bytes are on disk and before the
    // rename -- the window in which the destination used to be truncated.
    const seenByReader: Array<string | null> = []
    const realWrite = fs.writeFileSync.bind(fs)
    spyOn(fs, 'writeFileSync').mockImplementation(((...args: any[]) => {
      const result = (realWrite as any)(...args)
      seenByReader.push(
        fs.existsSync(credentialsPath)
          ? fs.readFileSync(credentialsPath, 'utf8')
          : null,
      )
      return result
    }) as typeof fs.writeFileSync)

    saveUserCredentials(TEST_USER)

    expect(seenByReader.length).toBeGreaterThan(0)
    for (const contents of seenByReader) {
      // The destination still holds the whole previous file; it is replaced
      // by the rename, not by the write.
      expect(contents).not.toBeNull()
      expect(() => JSON.parse(contents as string)).not.toThrow()
      expect(JSON.parse(contents as string)).toEqual(previous)
    }
    expect(getUserCredentials()?.email).toBe(TEST_USER.email)
  })

  test('the temp file is a sibling, and none is left behind', () => {
    saveUserCredentials(TEST_USER)

    expect(fs.readdirSync(configDir)).toEqual(['credentials.json'])
  })

  test('a failed write leaves the previous credentials intact', () => {
    fs.mkdirSync(configDir, { recursive: true })
    const previous = { default: TEST_USER, other: 'kept' }
    fs.writeFileSync(credentialsPath, JSON.stringify(previous, null, 2))

    // Restored by hand, not `mock.restore()`: that would also drop the
    // `getCredentialsPath` spy this test still reads through.
    const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device, write')
    })

    expect(() =>
      saveUserCredentials({ ...TEST_USER, email: 'new@x.com' }),
    ).toThrow()

    writeSpy.mockRestore()
    expect(JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))).toEqual(
      previous,
    )
    expect(getUserCredentials()?.email).toBe(TEST_USER.email)
  })

  test('clearing another profile also replaces the file whole', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({ default: TEST_USER, other: 'kept' }, null, 2),
    )

    clearUserCredentials()

    expect(fs.readdirSync(configDir)).toEqual(['credentials.json'])
    expect(JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))).toEqual({
      other: 'kept',
    })
  })
})
