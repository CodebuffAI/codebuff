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

  test('queryBlended threads config.weights.semanticBlend into ranking', async () => {
    // 'auth' is a lexical hit on auth.ts; 'repayment' embeds the 'payment' vocab
    // bit (payment.ts is a semantic hit) but does not lexically match any file
    // metadata — making payment.ts a purely-semantic result. semanticBlend=0
    // must nullify that semantic contribution.
    const rootZero = makeProject()
    const mgrZero = IndexManager.getInstance(
      rootZero,
      { semantic: { enabled: true }, weights: { semanticBlend: 0 } },
      fakeEmbed,
    )
    await mgrZero.waitUntilReady(10_000)
    expect(mgrZero.isSemanticReady()).toBe(true)

    const blendedZero = await mgrZero.queryBlended('auth repayment', { limit: 5 })
    expect(blendedZero.ready).toBe(true)
    const paymentZero = blendedZero.results.find((r) => r.path.includes('payment'))
    expect(paymentZero).toBeDefined()
    expect(paymentZero?.score).toBe(0)

    // With the default blend weight (1), the same purely-semantic hit surfaces
    // with a nonzero score — proving the weight is actually threaded through.
    const rootDefault = makeProject()
    const mgrDefault = IndexManager.getInstance(
      rootDefault,
      { semantic: { enabled: true } },
      fakeEmbed,
    )
    await mgrDefault.waitUntilReady(10_000)

    const blendedDefault = await mgrDefault.queryBlended('auth repayment', { limit: 5 })
    const paymentDefault = blendedDefault.results.find((r) => r.path.includes('payment'))
    expect(paymentDefault).toBeDefined()
    expect(paymentDefault?.score).toBeGreaterThan(0)
  })

  test('config.weights.lexical is threaded into queries', async () => {
    // 'loginUser' matches auth.ts primarily via its defined symbol, so zeroing
    // the symbol weight removes the only signal ranking it.
    const rootZero = makeProject()
    const mgrZero = IndexManager.getInstance(
      rootZero,
      { weights: { lexical: { symbol: 0 } } },
      fakeEmbed,
    )
    await mgrZero.waitUntilReady(10_000)

    const rootDefault = makeProject()
    const mgrDefault = IndexManager.getInstance(rootDefault, {}, fakeEmbed)
    await mgrDefault.waitUntilReady(10_000)

    const zeroResults = mgrZero.query('loginUser', { limit: 5 })
    const defaultResults = mgrDefault.query('loginUser', { limit: 5 })

    const defaultAuthScore =
      defaultResults.results.find((r) => r.path.includes('auth'))?.score ?? 0
    const zeroAuthScore =
      zeroResults.results.find((r) => r.path.includes('auth'))?.score ?? 0

    expect(defaultAuthScore).toBeGreaterThan(0)
    expect(zeroAuthScore).toBeLessThan(defaultAuthScore)
  })
})
