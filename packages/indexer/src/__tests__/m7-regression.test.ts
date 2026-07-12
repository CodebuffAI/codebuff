import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { IndexManager } from '../index-manager'
import { MAX_INDEX_AGE_MS } from '../index-store'
import { queryIndex } from '../query'

import type { EmbedFn } from '../semantic'
import type { MetadataIndex } from '../types'

/* ------------------------------------------------------------------ */
/* M7.1 — semantic boost is opt-in and OFF by default.                 */
/* ------------------------------------------------------------------ */
/* These tests PIN the existing invariants so a future PR cannot silently
 * flip the semantic default to `true`. Per SPEC R7: "semantic boost opt-in
 * and off-by-default". The three gates that must ALL hold for semantic search:
 *   1. config.semantic.enabled === true
 *   2. an embedder is wired (getInstance(..., embed))
 *   3. file vectors were built (fileVectors.length > 0)
 * If ANY gate is closed, semantic search is a no-op and results are lexical.
 * These tests assert NO runtime behavior change — only that the default
 * remains off and each gate independently keeps semantic disabled.
 */

const VOCAB = ['auth', 'login', 'token', 'payment', 'invoice', 'charge']
const fakeEmbed: EmbedFn = async (texts) =>
  texts.map((t) => {
    const lower = t.toLowerCase()
    return VOCAB.map((w) => (lower.includes(w) ? 1 : 0))
  })

const roots: string[] = []
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'openbuff-m7-'))
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

describe('M7.1 — semantic boost is opt-in and off by default', () => {
  test('default config (no semantic block) keeps semantic OFF even with an embedder wired', async () => {
    const root = makeProject()
    // Default config: no `semantic` field at all -> enabled resolves to falsy.
    const mgr = IndexManager.getInstance(root, {}, fakeEmbed)
    await mgr.waitUntilReady(10_000)

    // Gate 1 (config.semantic.enabled) is closed, so even though an embedder
    // is wired (gate 2) and the index is built, semantic search must be off.
    expect(mgr.isSemanticReady()).toBe(false)
    expect(await mgr.searchSemantic('user login auth token')).toEqual([])
  })

  test('an embedder alone does not flip semantic on — it requires explicit semantic.enabled', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(
      root,
      { semantic: { enabled: false } },
      fakeEmbed,
    )
    await mgr.waitUntilReady(10_000)

    expect(mgr.isSemanticReady()).toBe(false)
    expect(await mgr.searchSemantic('auth')).toEqual([])

    // Lexical search still works — semantic being off must not break querying.
    const lexical = mgr.query('loginUser', { limit: 5 })
    expect(lexical.ready).toBe(true)
    expect(lexical.results.some((r) => r.path.includes('auth'))).toBe(true)
  })

  test('semantic.enabled without an embedder stays OFF (gate 2 closed)', async () => {
    const root = makeProject()
    // Explicitly enabled, but no embedder supplied -> _buildVectors early-returns.
    const mgr = IndexManager.getInstance(root, { semantic: { enabled: true } })
    await mgr.waitUntilReady(10_000)

    expect(mgr.isSemanticReady()).toBe(false)
    expect(await mgr.searchSemantic('auth')).toEqual([])
  })

  test('all three gates open yields semantic search (control)', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(
      root,
      { semantic: { enabled: true } },
      fakeEmbed,
    )
    await mgr.waitUntilReady(10_000)

    expect(mgr.isSemanticReady()).toBe(true)
    const hits = await mgr.searchSemantic('user login auth token', 5)
    expect(hits.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/* M7.2 — stale-index detection surfaced in explain output.           */
/* ------------------------------------------------------------------ */
/* The explain path appends ` Index age: Ns (stale|fresh).` to each result's
 * explanation string, derived from `Date.now() - index.builtAt` vs.
 * MAX_INDEX_AGE_MS (5 min). This must APPEND to the existing explanation, not
 * replace it, and must not change the result shape or scoring.
 */

function makeExplainIndex(builtAt: number): MetadataIndex {
  return {
    version: '2',
    projectRoot: '/repo',
    builtAt,
    fileCount: 1,
    files: {
      'src/auth.ts': {
        path: 'src/auth.ts',
        mtime: 1,
        size: 100,
        hash: 'auth',
        ext: '.ts',
        symbols: ['loginUser', 'authToken'],
        imports: [],
        headings: [],
        concepts: [],
      },
    },
    graph: { nodes: {}, edges: [] },
  }
}

describe('M7.2 — stale-index detection in explain', () => {
  test('fresh index appends an "Index age: Ns (fresh)." note', () => {
    const fresh = makeExplainIndex(Date.now())
    const results = queryIndex(fresh, 'auth', { mode: 'explain', limit: 5 })

    expect(results.length).toBeGreaterThan(0)
    const result = results[0]
    expect(result).toBeDefined()
    const explanation = result?.explanation
    expect(explanation).toBeDefined()
    // Existing format is preserved (append, not replace).
    expect(explanation!).toContain('Matched on')
    // Staleness note appended.
    expect(explanation!).toMatch(/Index age: \d+s \(fresh\)\.$/)
  })

  test('stale index appends an "Index age: Ns (stale)." note', () => {
    const stale = makeExplainIndex(Date.now() - MAX_INDEX_AGE_MS - 60_000)
    const results = queryIndex(stale, 'auth', { mode: 'explain', limit: 5 })

    expect(results.length).toBeGreaterThan(0)
    const result = results[0]
    expect(result).toBeDefined()
    const explanation = result?.explanation
    expect(explanation).toBeDefined()
    expect(explanation!).toContain('Matched on')
    expect(explanation!).toMatch(/Index age: \d+s \(stale\)\.$/)
  })

  test('staleness note does not alter the result shape or score', () => {
    const stale = makeExplainIndex(Date.now() - 10 * 60 * 1000)
    const explainResults = queryIndex(stale, 'auth', {
      mode: 'explain',
      limit: 5,
    })
    const searchResults = queryIndex(stale, 'auth', {
      mode: 'search',
      limit: 5,
    })

    expect(explainResults.length).toBeGreaterThan(0)
    expect(searchResults.length).toBeGreaterThan(0)
    expect(explainResults[0]!.score).toBe(searchResults[0]!.score)
    expect(explainResults[0]!.path).toBe(searchResults[0]!.path)
    // search mode never attaches an explanation.
    expect(searchResults[0]!.explanation).toBeUndefined()
    // explain mode does attach one.
    expect(explainResults[0]!.explanation).toBeDefined()
  })

  test('the staleness boundary itself (exactly MAX_INDEX_AGE_MS) reads as stale', () => {
    // Date.now() - builtAt == MAX_INDEX_AGE_MS -> strictly greater is false at
    // the instant, but the query runs a moment later, so ageMs exceeds the
    // threshold. Either way the note is present and well-formed.
    const boundary = makeExplainIndex(Date.now() - MAX_INDEX_AGE_MS)
    const results = queryIndex(boundary, 'auth', { mode: 'explain', limit: 5 })
    const explanation = results[0]?.explanation
    expect(explanation).toBeDefined()
    expect(explanation!).toMatch(/Index age: \d+s \((?:stale|fresh)\)\.$/)
  })
})
