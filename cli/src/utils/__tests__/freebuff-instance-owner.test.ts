import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

const OWNER_FILE = 'freebuff-instance-owner.json'

ensureCliTestEnv()

const { getConfigDir } = await import('../auth')
const {
  isFreebuffInstanceOwnedByDeadLocalProcess,
  recordFreebuffInstanceOwner,
} = await import('../freebuff-instance-owner')

describe('freebuff instance owner', () => {
  let originalHome: string | undefined
  let tempHome: string

  const ownerPath = () => path.join(getConfigDir(), OWNER_FILE)

  beforeEach(() => {
    originalHome = process.env.HOME
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-owner-'))
    process.env.HOME = tempHome
  })

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  test('does not classify the current process as dead', () => {
    recordFreebuffInstanceOwner('inst-current')

    expect(
      isFreebuffInstanceOwnedByDeadLocalProcess('inst-current'),
    ).toBe(false)
  })

  test('classifies a matching owner with a dead pid as dead', () => {
    fs.mkdirSync(getConfigDir(), { recursive: true })
    fs.writeFileSync(
      ownerPath(),
      JSON.stringify({ instanceId: 'inst-dead', pid: 2_147_483_647 }),
    )

    expect(isFreebuffInstanceOwnedByDeadLocalProcess('inst-dead')).toBe(true)
  })

  test('ignores a dead pid for a different instance id', () => {
    fs.mkdirSync(getConfigDir(), { recursive: true })
    fs.writeFileSync(
      ownerPath(),
      JSON.stringify({ instanceId: 'inst-other', pid: 2_147_483_647 }),
    )

    expect(
      isFreebuffInstanceOwnedByDeadLocalProcess('inst-current'),
    ).toBe(false)
  })
})
