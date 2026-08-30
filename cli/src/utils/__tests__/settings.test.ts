import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GLM_V53_FLASH_MODEL_ID,
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

  test('keeps a saved pick exactly as chosen, for every catalog row', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    // Written directly, with no migration marker, exactly like a real
    // pre-upgrade settings file — which is the case that would silently rewrite
    // if a supersedes notice came back.
    fs.writeFileSync(
      path.join(testConfigDir, 'settings.json'),
      JSON.stringify({ freebuffModel: FREEBUFF_GLM_V53_FLASH_MODEL_ID }),
    )
    expect(loadFreebuffModelPreference()).toBe(FREEBUFF_GLM_V53_FLASH_MODEL_ID)

    // And a round-trip through save/load leaves every selectable row alone. The
    // property is "the picker is the user's decision, not ours" — asserted
    // across the catalog rather than on one row, because the failure mode is a
    // notice added for ONE model quietly acquiring this behaviour.
    for (const id of [
      FREEBUFF_GLM_V53_FLASH_MODEL_ID,
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      FREEBUFF_MIMO_V25_MODEL_ID,
    ]) {
      saveFreebuffModelPreference(id)
      expect(loadFreebuffModelPreference()).toBe(id)
    }
  })

  test('a withdrawn pick is DROPPED, not carried or rewritten', () => {
    testConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'freebuff-settings-test-'),
    )
    getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(testConfigDir)

    // DeepSeek V4 Pro was withdrawn from free mode on 2026-08-26. A saved
    // preference is the longest-lived way to hold a dead id: it survives every
    // deploy and outlives the release that dropped the row, so this is the
    // client half of the withdrawal.
    //
    // Written directly, because that is the only way it can arrive — an updated
    // client cannot SAVE the id, and the file predates the update.
    fs.writeFileSync(
      path.join(testConfigDir, 'settings.json'),
      JSON.stringify({ freebuffModel: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID }),
    )
    // Undefined, not a substitute. The catalog validation drops it and the
    // landing screen falls to its own default — which is a decision that
    // belongs there, not to a rewrite here. A migration would silently move the
    // user onto a specific model on every launch, which is exactly what the
    // supersedes machinery was removed for.
    expect(loadFreebuffModelPreference()).toBeUndefined()

    // And the updated client refuses to write it back, so the drop is durable
    // rather than re-inflicted from the picker.
    saveFreebuffModelPreference(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    expect(loadFreebuffModelPreference()).toBeUndefined()
  })
})
