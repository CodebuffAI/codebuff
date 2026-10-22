import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { FREEBUFF_ADS_FIXED_COPY, handleAdsDisable } from '../ads'

/**
 * `/ads:disable` on the Freebuff binary.
 *
 * `getAdsEnabled()` short-circuits to `true` when `IS_FREEBUFF`, so the command
 * could never affect this client. It still used to write `adsEnabled: false`
 * into the shared settings file and print "Ads disabled." — and that file is
 * read by Codebuff LITE, a PAID mode where the key does work. So the dead
 * switch preselected an ad-free paid session for anyone who tried it in free
 * mode.
 *
 * The mode is injected rather than read from `process.env`, because `IS_FREEBUFF`
 * is a module constant fixed at import time and bun shares one module registry
 * across test files: an env-based test would silently test whichever mode the
 * first file happened to import.
 */

describe('/ads:disable in Freebuff', () => {
  test('refuses in words and writes no setting', () => {
    const saves: Record<string, unknown>[] = []
    const next = handleAdsDisable({
      isFreebuff: true,
      save: (settings) => {
        saves.push(settings as Record<string, unknown>)
      },
    }).postUserMessage([])

    expect(next.at(-1)?.content).toBe(FREEBUFF_ADS_FIXED_COPY)
    expect(saves).toEqual([])
  })

  /**
   * The injected flag proves the LOGIC; this proves the WIRING.
   *
   * `IS_FREEBUFF` is fixed at import time and bun shares one module registry
   * across test files, so no in-process test can put this file in the free
   * build. A child process can: `FREEBUFF_MODE=true` with the same preload the
   * package's bunfig gives every test. Without this case, deleting the
   * `?? IS_FREEBUFF` default — the one line that makes the refusal reach
   * production — would leave both tests above green.
   */
  test('the production default refuses on a FREEBUFF_MODE=true build', () => {
    const cliRoot = path.resolve(import.meta.dir, '../../..')
    const preload = path.resolve(
      import.meta.dir,
      '../../../../sdk/test/setup-env.ts',
    )
    const script = [
      "const m = await import('./src/commands/ads.ts')",
      'let saves = 0',
      'const r = m.handleAdsDisable({ save: () => { saves += 1 } })',
      'const [msg] = r.postUserMessage([])',
      'console.log(JSON.stringify({',
      '  refusal: msg.content === m.FREEBUFF_ADS_FIXED_COPY,',
      '  saves,',
      '}))',
    ].join('\n')

    const proc = Bun.spawnSync({
      cmd: ['bun', '--preload', preload, '-e', script],
      cwd: cliRoot,
      env: { ...process.env, FREEBUFF_MODE: 'true' },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    expect(proc.stderr.toString()).toBe('')
    expect(proc.exitCode).toBe(0)
    const last = proc.stdout.toString().trim().split('\n').at(-1)!
    expect(JSON.parse(last)).toEqual({ refusal: true, saves: 0 })
  })

  test('still disables ads on the paid (non-Freebuff) build', () => {
    const saves: Record<string, unknown>[] = []
    const next = handleAdsDisable({
      isFreebuff: false,
      save: (settings) => {
        saves.push(settings as Record<string, unknown>)
      },
    }).postUserMessage([])

    expect(saves).toEqual([{ adsEnabled: false }])
    expect(next.at(-1)?.content).toBe('Ads disabled.')
  })
})
