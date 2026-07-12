import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { queryIndex } from './query'
import { evaluateRetrievalQuality } from './retrieval-quality'
import { buildMetadataIndex } from './metadata-indexer'

import type { RetrievalQualityCorpus } from './retrieval-quality'

interface OpenbuffCorpus extends RetrievalQualityCorpus {
  documents: Array<{
    path: string
    symbols: string[]
    concepts: string[]
  }>
}

const repositoryRoot = resolve(import.meta.dir, '../../..')
const corpusPath = resolve(
  import.meta.dir,
  '../fixtures/retrieval-quality-openbuff-v1.json',
)
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as OpenbuffCorpus

describe('versioned Openbuff retrieval-quality corpus', () => {
  test('references files in this repository and has a meaningful fixed size', () => {
    expect(corpus.version).toBe(1)
    expect(corpus.name).toBe('openbuff-repository-retrieval-v1')
    expect(corpus.documents.length).toBeGreaterThanOrEqual(15)
    expect(corpus.queries.length).toBeGreaterThanOrEqual(10)
    for (const document of corpus.documents) {
      expect(existsSync(resolve(repositoryRoot, document.path))).toBe(true)
    }
  })

  test('measures Recall@K, MRR, nDCG, noise, latency, and corpus size deterministically', async () => {
    const tinyCorpus: RetrievalQualityCorpus = {
      version: 7,
      name: 'metric-contract',
      documents: [{ path: 'a' }, { path: 'b' }, { path: 'c' }, { path: 'x' }],
      queries: [
        {
          id: 'ranked',
          query: 'ranked',
          relevant: [
            { path: 'a', relevance: 3 },
            { path: 'b', relevance: 1 },
          ],
        },
        {
          id: 'miss',
          query: 'miss',
          relevant: [{ path: 'c', relevance: 2 }],
        },
      ],
    }
    const clock = [0, 7, 20, 31]
    const report = await evaluateRetrievalQuality(
      tinyCorpus,
      (query) => (query === 'ranked' ? ['x', 'a', 'b'] : []),
      { k: 3, now: () => clock.shift()! },
    )

    expect(report.corpus).toEqual({ version: 7, documents: 4, queries: 2 })
    expect(report.recallAtK).toBe(0.5)
    expect(report.meanReciprocalRank).toBe(0.25)
    expect(report.normalizedDiscountedCumulativeGainAtK).toBeGreaterThan(0.3)
    expect(report.normalizedDiscountedCumulativeGainAtK).toBeLessThan(0.35)
    expect(report.noiseRateAtK).toBe(0.166667)
    expect(report.latency).toEqual({
      observed: true,
      samplesMs: [7, 11],
      meanMs: 9,
      maxMs: 11,
    })
  })

  test('holds the lexical retriever to quality gates over the actual repository index', async () => {
    const index = await buildMetadataIndex(repositoryRoot, {
      maxFiles: 10_000,
    })
    for (const document of corpus.documents) {
      expect(index.files[document.path]).toBeDefined()
    }
    let tick = 0
    const report = await evaluateRetrievalQuality(
      corpus,
      (query, limit) =>
        queryIndex(index, query, { limit }).map((result) => result.path),
      { k: 3, now: () => tick++ },
    )

    expect(report.corpus).toEqual({
      version: 1,
      documents: corpus.documents.length,
      queries: corpus.queries.length,
    })
    expect(report.recallAtK).toBeGreaterThanOrEqual(0.9)
    expect(report.meanReciprocalRank).toBeGreaterThanOrEqual(0.9)
    expect(report.normalizedDiscountedCumulativeGainAtK).toBeGreaterThanOrEqual(
      0.9,
    )
    expect(report.noiseRateAtK).toBeLessThanOrEqual(0.7)
    expect(report.latency.samplesMs).toEqual(
      Array.from({ length: corpus.queries.length }, () => 1),
    )
  }, 30_000)
})
