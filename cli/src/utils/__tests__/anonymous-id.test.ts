import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

const ANONYMOUS_ID_FILE = 'analytics-id.json'

ensureCliTestEnv()

const { getConfigDir } = await import('../config-dir')
const { getOrCreatePersistentAnonymousId, resetAnonymousIdCache } =
  await import('../anonymous-id')

describe('persistent anonymous id', () => {
  let originalHome: string | undefined
  let tempHome: string

  const idPath = () => path.join(getConfigDir(), ANONYMOUS_ID_FILE)

  beforeEach(() => {
    originalHome = process.env.HOME
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-anon-'))
    process.env.HOME = tempHome
    resetAnonymousIdCache()
  })

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
    resetAnonymousIdCache()
  })

  test('mints and persists an id on first call', () => {
    const id = getOrCreatePersistentAnonymousId()

    expect(id).toMatch(/^anon_/)
    expect(fs.existsSync(idPath())).toBe(true)
    expect(JSON.parse(fs.readFileSync(idPath(), 'utf8')).anonymousId).toBe(id)
  })

  test('returns the same id within a process (cached)', () => {
    const first = getOrCreatePersistentAnonymousId()
    const second = getOrCreatePersistentAnonymousId()

    expect(second).toBe(first)
  })

  test('reuses the persisted id across processes', () => {
    const first = getOrCreatePersistentAnonymousId()

    // Simulate a fresh process: clear the in-memory cache but keep the file.
    resetAnonymousIdCache()
    const second = getOrCreatePersistentAnonymousId()

    expect(second).toBe(first)
  })

  test('mints a fresh id when the persisted file is corrupt', () => {
    fs.mkdirSync(getConfigDir(), { recursive: true })
    fs.writeFileSync(idPath(), 'not json')

    const id = getOrCreatePersistentAnonymousId()

    expect(id).toMatch(/^anon_/)
    expect(JSON.parse(fs.readFileSync(idPath(), 'utf8')).anonymousId).toBe(id)
  })
})
