import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import * as auth from '../auth'
import {
  loadFreebuffModelPreference,
  saveFreebuffModelPreference,
} from '../settings'

let testConfigDir: string | undefined
let getConfigDirSpy: ReturnType<typeof spyOn> | undefined

afterEach(() => {
  getConfigDirSpy?.mockRestore()
  getConfigDirSpy = undefined
  if (testConfigDir) {
    fs.rmSync(testConfigDir, { recursive: true, force: true })
    testConfigDir = undefined
  }
})

describe('freebuff model preference', () => {
  test('referral-only GLM does not replace the remembered picker model', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    saveFreebuffModelPreference(FALLBACK_FREEBUFF_MODEL_ID)
    saveFreebuffModelPreference(FREEBUFF_GLM_V52_MODEL_ID)

    expect(loadFreebuffModelPreference()).toBe(FALLBACK_FREEBUFF_MODEL_ID)
  })

  test('migrates a saved superseded pick to its replacement exactly once', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    // A preference saved before Flash overtook Pro. Written directly so it has
    // no migration marker, exactly like a real pre-upgrade settings file.
    fs.writeFileSync(
      path.join(testConfigDir, 'settings.json'),
      JSON.stringify({ freebuffModel: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID }),
    )
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )

    // Re-picking Pro deliberately must STICK: the migration is a one-time
    // nudge, not a lock-in. (The save is what persists the marker.)
    saveFreebuffModelPreference(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    )
  })
})
