export interface RetrievalQualityDocument {
  path: string
}

export interface RetrievalQualityCase {
  id: string
  query: string
  relevant: Array<{
    path: string
    /** Graded relevance for nDCG. Defaults to 1. */
    relevance?: number
  }>
}

export interface RetrievalQualityCorpus {
  version: number
  name: string
  documents: RetrievalQualityDocument[]
  queries: RetrievalQualityCase[]
}

export interface RetrievalQualityMetrics {
  corpus: {
    version: number
    documents: number
    queries: number
  }
  k: number
  recallAtK: number
  meanReciprocalRank: number
  normalizedDiscountedCumulativeGainAtK: number
  noiseRateAtK: number
  latency: {
    observed: true
    samplesMs: number[]
    meanMs: number
    maxMs: number
  }
}

export interface RetrievalQualityEvaluationOptions {
  k?: number
  /** Injectable monotonic clock keeps evaluator tests deterministic. */
  now?: () => number
}

/**
 * Evaluate a retriever against a versioned, graded-relevance corpus. The
 * retriever returns ranked paths; timing is observed around each query but is
 * reported separately from quality so slow CI machines do not change scores.
 */
export async function evaluateRetrievalQuality(
  corpus: RetrievalQualityCorpus,
  retrieve: (query: string, limit: number) => string[] | Promise<string[]>,
  options: RetrievalQualityEvaluationOptions = {},
): Promise<RetrievalQualityMetrics> {
  const k = Math.max(1, Math.floor(options.k ?? 10))
  const now = options.now ?? performance.now.bind(performance)
  let recallTotal = 0
  let reciprocalRankTotal = 0
  let ndcgTotal = 0
  let noiseTotal = 0
  const samplesMs: number[] = []

  for (const testCase of corpus.queries) {
    const startedAt = now()
    const paths = (await retrieve(testCase.query, k)).slice(0, k)
    samplesMs.push(round(Math.max(0, now() - startedAt)))

    const relevanceByPath = new Map(
      testCase.relevant.map((entry) => [
        entry.path,
        Math.max(0, entry.relevance ?? 1),
      ]),
    )
    const relevantReturned = new Set(
      paths.filter((path) => (relevanceByPath.get(path) ?? 0) > 0),
    )
    const relevantCount = Array.from(relevanceByPath.values()).filter(
      (relevance) => relevance > 0,
    ).length
    recallTotal +=
      relevantCount === 0 ? 1 : relevantReturned.size / relevantCount

    const firstRelevantRank = paths.findIndex(
      (path) => (relevanceByPath.get(path) ?? 0) > 0,
    )
    if (firstRelevantRank >= 0)
      reciprocalRankTotal += 1 / (firstRelevantRank + 1)

    const dcg = discountedCumulativeGain(
      paths.map((path) => relevanceByPath.get(path) ?? 0),
    )
    const idealDcg = discountedCumulativeGain(
      Array.from(relevanceByPath.values())
        .sort((a, b) => b - a)
        .slice(0, k),
    )
    ndcgTotal += idealDcg === 0 ? 1 : dcg / idealDcg

    const noiseCount = paths.filter(
      (path) => (relevanceByPath.get(path) ?? 0) === 0,
    ).length
    noiseTotal += paths.length === 0 ? 0 : noiseCount / paths.length
  }

  const queryCount = corpus.queries.length
  return {
    corpus: {
      version: corpus.version,
      documents: corpus.documents.length,
      queries: queryCount,
    },
    k,
    recallAtK: mean(recallTotal, queryCount),
    meanReciprocalRank: mean(reciprocalRankTotal, queryCount),
    normalizedDiscountedCumulativeGainAtK: mean(ndcgTotal, queryCount),
    noiseRateAtK: mean(noiseTotal, queryCount),
    latency: {
      observed: true,
      samplesMs,
      meanMs:
        samplesMs.length === 0
          ? 0
          : round(
              samplesMs.reduce((sum, sample) => sum + sample, 0) /
                samplesMs.length,
            ),
      maxMs: samplesMs.length === 0 ? 0 : Math.max(...samplesMs),
    },
  }
}

function discountedCumulativeGain(relevances: number[]): number {
  return relevances.reduce(
    (total, relevance, index) =>
      total + (Math.pow(2, relevance) - 1) / Math.log2(index + 2),
    0,
  )
}

function mean(total: number, count: number): number {
  return count === 0 ? 0 : round(total / count)
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
