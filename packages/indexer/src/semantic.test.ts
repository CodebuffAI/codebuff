import { describe, expect, test } from 'bun:test'

import {
  blendSemanticScores,
  buildFileVectors,
  cosineSimilarity,
  fileEmbeddingText,
  getSemanticConfigFingerprint,
  isSemanticIndexingAvailable,
  semanticSearch,
} from './semantic'

import type { EmbedFn } from './semantic'
import type { IndexedFile } from './types'

function file(path: string, symbols: string[]): IndexedFile {
  return {
    path,
    mtime: 1,
    size: 1,
    hash: path,
    ext: '.ts',
    symbols,
    imports: [],
    headings: [],
    concepts: [],
  }
}

// Deterministic bag-of-words embedder over a fixed vocabulary. Cosine over
// these vectors reflects shared-keyword overlap, which is enough to assert
// ranking behavior without any network/model.
const VOCAB = [
  'auth',
  'login',
  'token',
  'payment',
  'invoice',
  'charge',
  'user',
  'database',
]
const fakeEmbed: EmbedFn = async (texts) =>
  texts.map((text) => {
    const lower = text.toLowerCase()
    return VOCAB.map((word) => (lower.includes(word) ? 1 : 0))
  })

describe('semantic engine', () => {
  test('fingerprints the configured model and resolved embedder identity', () => {
    const first: EmbedFn = async () => []
    first.cacheKey = 'provider-a/model-a'
    const same: EmbedFn = async () => []
    same.cacheKey = 'provider-a/model-a'
    const changedEndpoint: EmbedFn = async () => []
    changedEndpoint.cacheKey = 'provider-b/model-a'

    const config = { enabled: true, model: 'embedding-alias' }
    expect(getSemanticConfigFingerprint(config, first)).toBe(
      getSemanticConfigFingerprint(config, same),
    )
    expect(getSemanticConfigFingerprint(config, first)).not.toBe(
      getSemanticConfigFingerprint(config, changedEndpoint),
    )
    expect(getSemanticConfigFingerprint(config, first)).not.toBe(
      getSemanticConfigFingerprint(
        { enabled: true, model: 'another-model' },
        first,
      ),
    )
  })

  test('reuses vectors for unchanged content hashes', async () => {
    const calls: string[][] = []
    const embed: EmbedFn = async (texts) => {
      calls.push(texts)
      return texts.map(() => [1, 0])
    }
    const files = [file('a.ts', ['alpha'])]
    files[0].hash = 'same'
    const first = await buildFileVectors(files, embed)
    const second = await buildFileVectors(files, embed, 64, first)
    expect(second).toEqual(first)
    expect(calls).toHaveLength(1)
  })

  test('reuses content-hash vectors across renames and duplicate files', async () => {
    const calls: string[][] = []
    const embed: EmbedFn = async (texts) => {
      calls.push(texts)
      return texts.map(() => [1, 0])
    }
    const firstFile = file('old-name.ts', ['alpha'])
    firstFile.hash = 'shared-content'
    const previous = await buildFileVectors([firstFile], embed)

    const renamed = file('new-name.ts', ['alpha'])
    renamed.hash = 'shared-content'
    const duplicate = file('copy.ts', ['alpha'])
    duplicate.hash = 'shared-content'
    const vectors = await buildFileVectors(
      [renamed, duplicate],
      embed,
      64,
      previous,
    )

    expect(calls).toHaveLength(1)
    expect(vectors.map((entry) => entry.path)).toEqual([
      'new-name.ts',
      'copy.ts',
    ])
    expect(vectors.every((entry) => entry.vector === previous[0].vector)).toBe(
      true,
    )
  })
  test('isSemanticIndexingAvailable reflects whether an embedder exists', () => {
    expect(isSemanticIndexingAvailable(null)).toBe(false)
    expect(isSemanticIndexingAvailable(undefined)).toBe(false)
    expect(isSemanticIndexingAvailable(fakeEmbed)).toBe(true)
  })

  test('cosineSimilarity basics', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1, 2], [1])).toBe(0)
  })

  test('fileEmbeddingText includes path and symbols', () => {
    const text = fileEmbeddingText(
      file('src/auth.ts', ['loginUser', 'AuthToken']),
    )
    expect(text).toContain('src/auth.ts')
    expect(text).toContain('loginUser')
  })

  test('semanticSearch ranks files by intent overlap', async () => {
    const files = [
      file('src/auth.ts', ['login', 'token', 'user']),
      file('src/payment.ts', ['payment', 'invoice', 'charge']),
      file('src/db.ts', ['database', 'user']),
    ]
    const vectors = await buildFileVectors(files, fakeEmbed)
    expect(vectors).toHaveLength(3)

    const hits = await semanticSearch(
      'how do we handle user login token auth',
      vectors,
      fakeEmbed,
      3,
    )
    expect(hits[0].path).toBe('src/auth.ts')
    // payment.ts shares no query words → filtered out or last.
    expect(hits.find((h) => h.path === 'src/payment.ts')).toBeUndefined()
  })

  test('blendSemanticScores merges and re-ranks', () => {
    const lexical = [
      { path: 'a.ts', score: 10 },
      { path: 'b.ts', score: 8 },
    ]
    const semantic = [
      { path: 'b.ts', score: 0.9 },
      { path: 'c.ts', score: 0.8 },
    ]
    const blended = blendSemanticScores(lexical, semantic, 1)
    const byPath = Object.fromEntries(blended.map((r) => [r.path, r.score]))
    // b.ts gets both lexical + semantic; c.ts appears purely from semantic.
    expect(byPath['b.ts']).toBeGreaterThan(8)
    expect(byPath['c.ts']).toBeGreaterThan(0)
    // Sorted descending.
    for (let i = 1; i < blended.length; i++) {
      expect(blended[i - 1].score).toBeGreaterThanOrEqual(blended[i].score)
    }
  })

  test('semanticSearch returns [] with no vectors or empty query', async () => {
    expect(await semanticSearch('x', [], fakeEmbed)).toEqual([])
    expect(
      await semanticSearch('', [{ path: 'a', vector: [1] }], fakeEmbed),
    ).toEqual([])
  })

  test('blendSemanticScores with weight 0 nullifies semantic contribution', () => {
    const lexical = [
      { path: 'a.ts', score: 10 },
      { path: 'b.ts', score: 8 },
    ]
    const semantic = [
      { path: 'b.ts', score: 0.9 },
      { path: 'c.ts', score: 0.8 },
    ]
    const blended = blendSemanticScores(lexical, semantic, 0)
    const byPath = Object.fromEntries(blended.map((r) => [r.path, r.score]))

    // A zero blend disables semantic-only results entirely.
    expect(byPath['c.ts']).toBeUndefined()
    // …and a blended entry keeps exactly its lexical score.
    expect(byPath['b.ts']).toBe(8)
  })

  test('blendSemanticScores scales semantic contribution by the weight', () => {
    const lexical = [
      { path: 'a.ts', score: 10 },
      { path: 'b.ts', score: 8 },
    ]
    const semantic = [
      { path: 'b.ts', score: 0.9 },
      { path: 'c.ts', score: 0.8 },
    ]
    const weight1 = blendSemanticScores(lexical, semantic, 1)
    const weight2 = blendSemanticScores(lexical, semantic, 2)

    const c1 = weight1.find((r) => r.path === 'c.ts')?.score ?? 0
    const c2 = weight2.find((r) => r.path === 'c.ts')?.score ?? 0

    // Doubling the weight doubles the semantic-only score (same maxLexical base
    // so the ratio is exact).
    expect(c2).toBeCloseTo(c1 * 2)
  })
})
