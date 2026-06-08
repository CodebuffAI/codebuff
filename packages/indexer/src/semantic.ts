// Semantic (embedding-based) search for the codebase index.
//
// The engine is dependency-injected: it takes an `EmbedFn` (a batch embedder)
// so it can be unit-tested deterministically and so the host (CLI/SDK) supplies
// a provider-backed embedder built from the user's BYOK config. Enable via
// openbuff.json:
//   { "indexing": { "semantic": { "enabled": true, "model": "openai/text-embedding-3-small" } } }
//
// Lexical search (query.ts) stays the always-available default; semantic search
// augments it when an embedder is configured.

import type { IndexedFile } from './types'

/** Batch embedder: maps input texts to equal-length vectors, order-preserving. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>

export interface FileVector {
  path: string
  vector: number[]
}

export interface SemanticHit {
  path: string
  score: number
}

export function isSemanticIndexingAvailable(embed?: EmbedFn | null): boolean {
  return typeof embed === 'function'
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Compact natural-language-ish representation of a file for embedding: path,
 * symbols, headings, and concepts. Deliberately small so embedding is cheap and
 * stays within model input limits.
 */
export function fileEmbeddingText(file: IndexedFile): string {
  const parts = [
    file.path,
    file.symbols.slice(0, 40).join(' '),
    file.headings.slice(0, 20).join(' '),
    file.concepts.slice(0, 30).join(' '),
  ]
  return parts.filter((p) => p && p.trim().length > 0).join('\n')
}

/** Embed every file (batched) into vectors. Errors propagate to the caller. */
export async function buildFileVectors(
  files: IndexedFile[],
  embed: EmbedFn,
  batchSize = 64,
): Promise<FileVector[]> {
  const vectors: FileVector[] = []
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const embeddings = await embed(batch.map(fileEmbeddingText))
    for (let j = 0; j < batch.length; j++) {
      const vector = embeddings[j]
      if (vector && vector.length > 0) {
        vectors.push({ path: batch[j].path, vector })
      }
    }
  }
  return vectors
}

/** Embed the query and rank stored file vectors by cosine similarity. */
export async function semanticSearch(
  query: string,
  vectors: FileVector[],
  embed: EmbedFn,
  limit = 20,
): Promise<SemanticHit[]> {
  if (vectors.length === 0 || query.trim().length === 0) return []
  const [queryVector] = await embed([query])
  if (!queryVector || queryVector.length === 0) return []

  return vectors
    .map((entry) => ({
      path: entry.path,
      score: cosineSimilarity(queryVector, entry.vector),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Blend semantic hits into an existing (already-sorted) lexical result set.
 * Semantic scores are normalized to the lexical score range so neither signal
 * dominates, then added. Returns a new sorted list of paths with combined
 * scores. `weight` controls semantic influence (0..1+).
 */
export function blendSemanticScores(
  lexical: { path: string; score: number }[],
  semantic: SemanticHit[],
  weight = 1,
): { path: string; score: number }[] {
  const maxLexical = Math.max(1e-9, ...lexical.map((r) => r.score))
  const merged = new Map<string, number>()
  for (const r of lexical) merged.set(r.path, r.score)
  for (const hit of semantic) {
    // Scale cosine (0..1) into the lexical magnitude so the two are comparable.
    const scaled = hit.score * maxLexical * weight
    merged.set(hit.path, (merged.get(hit.path) ?? 0) + scaled)
  }
  return Array.from(merged.entries())
    .map(([path, score]) => ({ path, score }))
    .sort((a, b) => b.score - a.score)
}
