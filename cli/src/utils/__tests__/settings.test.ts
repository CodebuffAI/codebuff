import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
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

  test('steers a saved superseded pick to its replacement on every load', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    // A preference saved before Flash overtook MiniMax M3. Written directly so
    // it has no migration marker, exactly like a real pre-upgrade settings file.
    fs.writeFileSync(
      path.join(testConfigDir, 'settings.json'),
      JSON.stringify({ freebuffModel: FREEBUFF_MINIMAX_M3_MODEL_ID }),
    )
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )

    // Re-picking M3 does NOT make it the standing default again: the next
    // session steers back to Flash. Selecting it still works for the session
    // the user is in — this only governs what a fresh launch opens on.
    saveFreebuffModelPreference(FREEBUFF_MINIMAX_M3_MODEL_ID)
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )

    // NOT the same for MiMo 2.5 any more. It stopped being superseded on
    // 2026-08-18, when Flash became premium and MiMo became the only unlimited
    // row — so a user who picks the model that always works keeps it, instead
    // of being steered every launch onto one their daily pool may not cover.
    saveFreebuffModelPreference(FREEBUFF_MIMO_V25_MODEL_ID)
    expect(loadFreebuffModelPreference()).toBe(FREEBUFF_MIMO_V25_MODEL_ID)
  })

  test('steers a saved V4 Pro pick to Flash on every load', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    // Pro is selectable again as of 2026-08-19 and is nobody's recommendation,
    // so a stored pick migrates rather than being dropped: it costs several
    // times Flash for the same daily session, and a standing default is the one
    // place that difference compounds silently, launch after launch.
    fs.writeFileSync(
      path.join(testConfigDir, 'settings.json'),
      JSON.stringify({ freebuffModel: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID }),
    )
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )

    // Re-picking it does not make it the standing default again. Selecting it
    // for the session the user is in still works — this governs launches.
    saveFreebuffModelPreference(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(loadFreebuffModelPreference()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
  })
})
