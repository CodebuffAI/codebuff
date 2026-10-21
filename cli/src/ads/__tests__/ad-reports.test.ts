import { describe, expect, test } from 'bun:test'
import type { AdReport } from '@codebuff/common/ads/ad-report'
import { createAdReportRegistry } from '../ad-reports'

const AD = {
  title: 'First ad',
  url: 'https://example.com/first',
  surface: 'cli',
  impUrl: 'first',
}

describe('report targets and state', () => {
  test('keyboard reports the original numbered snapshot after rotation', async () => {
    const sent: AdReport[] = []
    const registry = createAdReportRegistry(async (ad) => {
      sent.push(ad)
    })
    const original = { ...AD }
    const first = registry.register(original)
    original.title = 'mutated later'
    registry.register({ ...AD, title: 'Second ad', impUrl: 'second' })
    expect(await registry.command('')).toContain(`${first.id}: First ad`)
    expect(await registry.command(String(first.id))).toBe(
      'Ad reported. Thank you.',
    )
    expect(sent).toEqual([AD])
    expect(await registry.command('999')).toContain('Ad not found')
  })

  test('duplicates are blocked while sending and after success; failures allow retry', async () => {
    let finish!: () => void
    let calls = 0
    const registry = createAdReportRegistry(async () => {
      calls++
      if (calls === 1) throw new Error('offline')
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const entry = registry.register(AD)
    expect(registry.register({ ...AD })).toBe(entry)
    expect(await registry.submit(entry)).toBe('error')
    const retry = registry.submit(entry)
    expect(entry.status).toBe('sending')
    expect(await registry.submit(entry)).toBe('sending')
    finish()
    expect(await retry).toBe('sent')
    expect(await registry.submit(entry)).toBe('sent')
    expect(calls).toBe(2)
  })

  test('history is bounded without evicting mounted controls', async () => {
    const registry = createAdReportRegistry(async () => {})
    expect(await registry.command('')).toContain('No ads')
    const mounted = registry.register(AD)
    mounted.mounted++
    const recent = registry.register({ ...AD, impUrl: 'old' })
    for (let index = 0; index < 110; index++)
      registry.register({ ...AD, impUrl: String(index) })
    expect(await registry.command(String(mounted.id))).toBe(
      'Ad reported. Thank you.',
    )
    expect(await registry.command(String(recent.id))).toContain('Ad not found')
  })
})
