import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearProviderConfigCacheForTest } from '@openbuff/sdk'

import { getOpenbuffProviderReadiness } from '../../utils/openbuff-provider'

describe('getOpenbuffProviderReadiness', () => {
  let originalCwd: string
  let tempDir: string
  let originalConfigDir: string | undefined

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-readiness-'))
    originalConfigDir = process.env.OPENBUFF_CONFIG_DIR
    process.env.OPENBUFF_CONFIG_DIR = path.join(tempDir, 'global-config')
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalConfigDir === undefined) delete process.env.OPENBUFF_CONFIG_DIR
    else process.env.OPENBUFF_CONFIG_DIR = originalConfigDir
    clearProviderConfigCacheForTest()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('fails closed when the project provider config is malformed', () => {
    const configPath = path.join(tempDir, 'openbuff.json')
    fs.writeFileSync(configPath, '{ invalid json')
    process.chdir(tempDir)
    clearProviderConfigCacheForTest()

    const result = getOpenbuffProviderReadiness({
      agent: 'base2',
      agentMode: 'DEFAULT',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('configuration is invalid')
      expect(result.message).toContain(configPath)
    }
  })
})
