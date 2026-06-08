import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { IndexManager } from './index-manager'

import type { EmbedFn } from './semantic'

const VOCAB = ['auth', 'login', 'token', 'payment', 'invoice', 'charge']
const fakeEmbed: EmbedFn = async (texts) =>
  texts.map((t) => {
    const lower = t.toLowerCase()
    return VOCAB.map((w) => (lower.includes(w) ? 1 : 0))
  })

const roots: string[] = []
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'openbuff-semantic-'))
  roots.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'auth.ts'),
    'export function loginUser() {}\nexport function authToken() {}\n',
  )
  writeFileSync(
    join(root, 'src', 'payment.ts'),
    'export function chargeInvoice() {}\nexport function makePayment() {}\n',
  )
  return root
}

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
})

describe('IndexManager semantic integration', () => {
  test('builds vectors and ranks files by semantic similarity', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(root, { semantic: { enabled: true } }, fakeEmbed)
    await mgr.waitUntilReady(10_000)

    expect(mgr.isSemanticReady()).toBe(true)
    const hits = await mgr.searchSemantic('user login auth token', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].path).toContain('auth')
  })

  test('searchSemantic returns [] when semantic is disabled', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(root, { semantic: { enabled: false } }, fakeEmbed)
    await mgr.waitUntilReady(10_000)
    expect(mgr.isSemanticReady()).toBe(false)
    expect(await mgr.searchSemantic('anything')).toEqual([])
  })

  test('queryBlended folds semantic hits into the ranking', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(root, { semantic: { enabled: true } }, fakeEmbed)
    await mgr.waitUntilReady(10_000)

    const blended = await mgr.queryBlended('user login auth token', { limit: 5 })
    expect(blended.ready).toBe(true)
    expect(blended.results[0].path).toContain('auth')
    // A purely-semantic hit carries the 'semantic' matchedOn marker.
    const authHit = blended.results.find((r) => r.path.includes('auth'))!
    expect(authHit.matchedOn.length).toBeGreaterThan(0)
  })

  test('queryBlended returns pure lexical results when semantic is off', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(root, { semantic: { enabled: false } }, fakeEmbed)
    await mgr.waitUntilReady(10_000)
    const blended = await mgr.queryBlended('auth', { limit: 5 })
    expect(blended.ready).toBe(true)
  })
})
