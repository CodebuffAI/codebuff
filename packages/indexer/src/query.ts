import type {
  IndexedFile,
  IndexEdge,
  LexicalWeights,
  MetadataIndex,
  QueryIndexMode,
  QueryIndexResult,
  RelatedFile,
} from './types'

import { MAX_INDEX_AGE_MS } from './index-store'
import { getPostingCandidates, getPostingDocumentFrequency } from './query-data'

export interface QueryOptions {
  limit?: number
  fileTypes?: string[]
  pathPrefixes?: string[]
  mode?: QueryIndexMode
  from?: string
  to?: string
  /**
   * Lexical field weights for this query. When omitted (or a field is unset),
   * historical defaults apply. The {@link IndexManager} resolves these from
   * `indexing.weights.lexical` in `openbuff.json` so tuning is global per
   * project; tests / direct callers may override per-query.
   */
  lexicalWeights?: LexicalWeights
}

/** Historical hardcoded lexical scoring constants — the ranking baseline. */
export const DEFAULT_LEXICAL_WEIGHTS: Required<LexicalWeights> = {
  fileName: 5,
  path: 2,
  symbol: 3,
  heading: 2.5,
  concept: 1.5,
  import: 1,
}

/** Merge partial user weights over the historical defaults (undefined-safe). */
export function resolveLexicalWeights(
  weights?: LexicalWeights,
): Required<LexicalWeights> {
  const resolved: Required<LexicalWeights> = { ...DEFAULT_LEXICAL_WEIGHTS }
  if (weights) {
    for (const key of Object.keys(
      DEFAULT_LEXICAL_WEIGHTS,
    ) as (keyof LexicalWeights)[]) {
      const value = weights[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        resolved[key] = value
      }
    }
  }
  return resolved
}

type GraphAdjacency = Map<string, IndexEdge[]>
const adjacencyCache = new WeakMap<MetadataIndex, GraphAdjacency>()

const MAX_RELATED_FILES_PER_RESULT = 5
const LOW_VALUE_RELATED_NODE_TYPES = new Set(['import', 'concept'])
const NOISY_PATH_SEGMENTS = new Set([
  '.bun-install',
  '.cache',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
])

export interface QueryQualityCase {
  query: string
  expectedPaths: string[]
  options?: QueryOptions
}

export interface QueryQualityReport {
  total: number
  passed: number
  failed: Array<{
    query: string
    expectedPaths: string[]
    actualPaths: string[]
  }>
  meanReciprocalRank: number
}

export function evaluateQueryIndexQuality(
  index: MetadataIndex,
  cases: QueryQualityCase[],
): QueryQualityReport {
  let reciprocalRankTotal = 0
  const failed: QueryQualityReport['failed'] = []

  for (const testCase of cases) {
    const limit = Math.max(testCase.options?.limit ?? 10, 10)
    const results = queryIndex(index, testCase.query, {
      ...testCase.options,
      limit,
    })
    const actualPaths = results.map((result) => result.path)
    const firstExpectedRank = actualPaths.findIndex((path) =>
      testCase.expectedPaths.includes(path),
    )

    if (firstExpectedRank >= 0) {
      reciprocalRankTotal += 1 / (firstExpectedRank + 1)
    }

    const missing = testCase.expectedPaths.filter(
      (path) => !actualPaths.slice(0, limit).includes(path),
    )
    if (missing.length > 0) {
      failed.push({
        query: testCase.query,
        expectedPaths: testCase.expectedPaths,
        actualPaths,
      })
    }
  }

  return {
    total: cases.length,
    passed: cases.length - failed.length,
    failed,
    meanReciprocalRank:
      cases.length === 0 ? 0 : roundScore(reciprocalRankTotal / cases.length),
  }
}

export function queryIndex(
  index: MetadataIndex,
  query: string,
  options: QueryOptions = {},
): QueryIndexResult[] {
  const { limit = 20, fileTypes, mode = 'search', pathPrefixes } = options
  const tokens = tokenizeQuery(query)
  const adjacency = getAdjacency(index)
  const commandIntent =
    mode === 'commands' || isCommandDiscoveryQuery(query)
  const lexicalWeights = resolveLexicalWeights(options.lexicalWeights)

  if (mode === 'neighbors') {
    return applyPathScope(
      queryNeighbors(index, adjacency, tokens, options, lexicalWeights),
      pathPrefixes,
    ).slice(0, limit)
  }
  if (mode === 'path') {
    return applyPathScope(
      queryPath(index, adjacency, tokens, options, lexicalWeights),
      pathPrefixes,
    ).slice(0, limit)
  }
  if (mode === 'references') {
    return applyPathScope(
      queryReferences(index, adjacency, tokens, options, lexicalWeights),
      pathPrefixes,
    ).slice(0, limit)
  }
  if (mode === 'explain') {
    return querySearch(
      index,
      adjacency,
      tokens,
      fileTypes,
      limit,
      true,
      commandIntent,
      lexicalWeights,
      pathPrefixes,
    )
  }
  return querySearch(
    index,
    adjacency,
    tokens,
    fileTypes,
    limit,
    mode === 'commands',
    commandIntent,
    lexicalWeights,
    pathPrefixes,
  )
}

function pathMatchesPrefixes(
  filePath: string,
  pathPrefixes: string[] | undefined,
): boolean {
  if (!pathPrefixes || pathPrefixes.length === 0) return true
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  return pathPrefixes.some((rawPrefix) => {
    const prefix = rawPrefix
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+|\/+$/g, '')
    return (
      prefix.length > 0 &&
      (normalized === prefix || normalized.startsWith(`${prefix}/`))
    )
  })
}

function applyPathScope(
  results: QueryIndexResult[],
  pathPrefixes: string[] | undefined,
): QueryIndexResult[] {
  if (!pathPrefixes || pathPrefixes.length === 0) return results
  return results
    .filter((result) => pathMatchesPrefixes(result.path, pathPrefixes))
    .map((result) => ({
      ...result,
      relatedFiles: result.relatedFiles?.filter((related) =>
        pathMatchesPrefixes(related.path, pathPrefixes),
      ),
    }))
}

function querySearch(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  fileTypes: string[] | undefined,
  limit: number,
  explain: boolean,
  commandIntent: boolean,
  lexicalWeights: Required<LexicalWeights>,
  pathPrefixes?: string[],
): QueryIndexResult[] {
  if (tokens.length === 0) {
    const results = Object.values(index.files)
      .filter((file) => matchesFileType(file, fileTypes))
      .filter((file) => pathMatchesPrefixes(file.path, pathPrefixes))
      .filter((file) => !commandIntent || isCommandDiscoveryFile(file))
      .map((file) => ({
        path: file.path,
        score: commandIntent ? commandDiscoveryBoost(file, tokens) : 0,
        matchedOn: commandIntent
          ? (['command'] as QueryIndexResult['matchedOn'])
          : [],
        matchedSnippets: commandIntent
          ? commandMatchedSnippets(file, tokens)
          : undefined,
      }))
    return (
      commandIntent ? results.sort((a, b) => b.score - a.score) : results
    ).slice(0, limit)
  }

  const directResults = new Map<string, QueryIndexResult>()
  const idf = computeIdfForTokens(index, tokens)
  const candidates = commandIntent ? null : getPostingCandidates(index, tokens)
  const filesToScore = candidates
    ? Array.from(candidates, (filePath) => index.files[filePath]).filter(
        (file): file is IndexedFile => Boolean(file),
      )
    : Object.values(index.files)

  for (const file of filesToScore) {
    if (!matchesFileType(file, fileTypes)) continue
    if (!pathMatchesPrefixes(file.path, pathPrefixes)) continue

    const result = scoreFile(file, tokens, idf, commandIntent, lexicalWeights)
    if (result.score > 0) {
      directResults.set(file.path, result)
    }
  }

  if (!commandIntent) {
    const graphScores = scoreGraphNeighborhood(index, adjacency, directResults)
    for (const [path, related] of graphScores.entries()) {
      if (!matchesFileType(index.files[path], fileTypes)) continue
      if (!pathMatchesPrefixes(path, pathPrefixes)) continue
      const existing = directResults.get(path)
      if (existing) {
        existing.score += related.score
        existing.matchedOn = addMatchedOn(existing.matchedOn, 'graph')
        existing.relatedFiles = mergeRelatedFiles(
          existing.relatedFiles,
          related.relatedFiles,
        )
      } else {
        directResults.set(path, {
          path,
          score: related.score,
          matchedOn: ['graph'],
          symbols: index.files[path]?.symbols.slice(0, 10),
          headings: index.files[path]?.headings.slice(0, 5),
          relatedFiles: related.relatedFiles,
        })
      }
    }
  }

  const indexAgeMs = Date.now() - index.builtAt
  const stale = indexAgeMs > MAX_INDEX_AGE_MS

  // Top-level results are already prefix-filtered during scoring; only
  // relatedFiles need the prefix filter here.
  return Array.from(directResults.values())
    .map((result) => ({
      ...result,
      score: roundScore(result.score),
      relatedFiles: result.relatedFiles
        ?.filter((related) => pathMatchesPrefixes(related.path, pathPrefixes))
        .slice(0, MAX_RELATED_FILES_PER_RESULT),
      matchedSnippets: result.matchedSnippets?.slice(0, 5),
      explanation: explain
        ? explainResult(result, { ageMs: indexAgeMs, stale })
        : undefined,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function queryNeighbors(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  options: QueryOptions,
  lexicalWeights: Required<LexicalWeights>,
): QueryIndexResult[] {
  const seedPaths = findSeedPaths(
    index,
    tokens,
    options.from,
    options.fileTypes,
    lexicalWeights,
  )
  const related = new Map<string, QueryIndexResult>()
  for (const seedPath of seedPaths) {
    for (const item of getRelatedFiles(index, adjacency, seedPath, 2)) {
      if (
        item.path === seedPath ||
        isNoisyFilePath(item.path) ||
        !matchesFileType(index.files[item.path], options.fileTypes)
      )
        continue
      const existing = related.get(item.path)
      if (existing) {
        existing.score += item.score
        existing.relatedFiles = mergeRelatedFiles(existing.relatedFiles, [
          { ...item, path: seedPath },
        ])
      } else {
        const file = index.files[item.path]
        related.set(item.path, {
          path: item.path,
          score: item.score,
          matchedOn: ['graph'],
          symbols: file?.symbols.slice(0, 10),
          headings: file?.headings.slice(0, 5),
          relatedFiles: [{ ...item, path: seedPath }],
          explanation: `Related to ${seedPath}: ${item.reason}`,
        })
      }
    }
  }
  return Array.from(related.values())
    .map((result) => ({ ...result, score: roundScore(result.score) }))
    .sort((a, b) => b.score - a.score)
}

function queryPath(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  options: QueryOptions,
  lexicalWeights: Required<LexicalWeights>,
): QueryIndexResult[] {
  // Compute the seed list once and derive both endpoints from it to avoid
  // duplicate IDF + scoring work when neither from nor to is explicit.
  const seedPaths =
    options.from && options.to
      ? []
      : findSeedPaths(index, tokens, undefined, options.fileTypes, lexicalWeights)
  const from = options.from ?? seedPaths[0]
  const to = options.to ?? seedPaths.find((path) => path !== from)
  if (!from || !to) return []

  const path = shortestFilePath(index, adjacency, from, to)
  if (path.length === 0) return []

  return path
    .filter(
      (filePath) =>
        !isNoisyFilePath(filePath) &&
        matchesFileType(index.files[filePath], options.fileTypes),
    )
    .map((filePath, i, filteredPath) => {
      const file = index.files[filePath]
      return {
        path: filePath,
        score: filteredPath.length - i,
        matchedOn: ['graph'],
        symbols: file?.symbols.slice(0, 10),
        headings: file?.headings.slice(0, 5),
        explanation: `Graph path ${i + 1}/${filteredPath.length} from ${from} to ${to}`,
      }
    })
}

function scoreFile(
  file: IndexedFile,
  tokens: string[],
  idf: Map<string, number> | undefined,
  commandIntent: boolean,
  lexicalWeights: Required<LexicalWeights>,
): QueryIndexResult {
  let score = 0
  const matchedOn = new Set<QueryIndexResult['matchedOn'][number]>()

  const normalizedPath = file.path.toLowerCase().replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/')
  const fileName = pathSegments[pathSegments.length - 1] ?? ''

  for (const token of tokens) {
    // Inverse document frequency: rare tokens discriminate, ubiquitous tokens
    // (e.g. "config", "index") barely move the score so they stop flooding
    // results. Defaults to 1 when no corpus stats were supplied.
    const weight = idf?.get(token) ?? 1

    if (fileName.includes(token)) {
      score += lexicalWeights.fileName * weight
      matchedOn.add('path')
    } else if (normalizedPath.includes(token)) {
      score += lexicalWeights.path * weight
      matchedOn.add('path')
    }

    for (const sym of file.symbols) {
      if (symbolMatchesToken(sym.toLowerCase(), token)) {
        score += lexicalWeights.symbol * weight
        matchedOn.add('symbol')
        break
      }
    }

    for (const h of file.headings) {
      if (h.toLowerCase().includes(token)) {
        score += lexicalWeights.heading * weight
        matchedOn.add('heading')
        break
      }
    }

    for (const concept of file.concepts) {
      if (concept.includes(token)) {
        score += lexicalWeights.concept * weight
        matchedOn.add('concept')
        break
      }
    }

    for (const imp of file.imports) {
      if (imp.toLowerCase().includes(token)) {
        score += lexicalWeights.import * weight
        matchedOn.add('import')
        break
      }
    }
  }

  const commandBoost = commandIntent ? commandDiscoveryBoost(file, tokens) : 0
  if (commandBoost > 0) {
    score += commandBoost
    matchedOn.add('command')
  } else if (commandIntent) {
    score *= 0.35
  }

  const depth = normalizedPath.split('/').length
  if (depth > 4) score *= Math.pow(0.95, depth - 4)
  if (isNoisyPath(pathSegments)) score *= 0.2

  return {
    path: file.path,
    score,
    matchedOn: Array.from(matchedOn),
    symbols: file.symbols.slice(0, 10),
    headings: file.headings.slice(0, 5),
    matchedSnippets: commandIntent
      ? commandMatchedSnippets(file, tokens)
      : undefined,
  }
}

/**
 * Smoothed inverse document frequency per query token over the indexed corpus.
 * A token appearing in few files gets a high weight; one appearing nearly
 * everywhere gets a weight near 1. Only query tokens are scored, so this is
 * O(files × queryTokens).
 */
function computeIdfForTokens(
  index: MetadataIndex,
  tokens: string[],
): Map<string, number> {
  const total = index.fileCount
  const idf = new Map<string, number>()
  if (total === 0) {
    for (const token of tokens) idf.set(token, 1)
    return idf
  }

  for (const token of tokens) {
    let df = getPostingDocumentFrequency(index, token)
    if (df === undefined) {
      df = 0
      for (const file of Object.values(index.files)) {
        if (fileContainsToken(file, token)) df++
      }
    }
    // log((N+1)/(df+1)) + 1 — always >= 1 (the +1 floor keeps every match
    // contributing at least its base weight); rare tokens approach log(N)+1.
    idf.set(token, Math.log((total + 1) / (df + 1)) + 1)
  }
  return idf
}

/**
 * Shared symbol/token match predicate used by both scoreFile (ranking) and
 * fileContainsToken (IDF document-frequency fallback), so the two can never
 * diverge. Forward substring (token inside a longer symbol) is the common
 * case; the reverse (symbol inside the token) is only allowed for substantial
 * symbols (>= 4 chars) — otherwise a 1-2 char symbol matches almost every token.
 */
function symbolMatchesToken(symLower: string, token: string): boolean {
  return (
    symLower.includes(token) ||
    (symLower.length >= 4 && token.includes(symLower))
  )
}

function fileContainsToken(file: IndexedFile, token: string): boolean {
  if (file.path.toLowerCase().replace(/\\/g, '/').includes(token)) return true
  for (const sym of file.symbols) {
    if (symbolMatchesToken(sym.toLowerCase(), token)) return true
  }
  for (const h of file.headings) {
    if (h.toLowerCase().includes(token)) return true
  }
  for (const concept of file.concepts) {
    if (concept.includes(token)) return true
  }
  for (const imp of file.imports) {
    if (imp.toLowerCase().includes(token)) return true
  }
  return false
}

function scoreGraphNeighborhood(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  directResults: Map<string, QueryIndexResult>,
): Map<string, { score: number; relatedFiles: RelatedFile[] }> {
  const graphScores = new Map<
    string,
    { score: number; relatedFiles: RelatedFile[] }
  >()
  const sortedDirectResults = Array.from(directResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)

  for (const result of sortedDirectResults) {
    const boost = Math.min(3, result.score / 4)
    for (const related of getRelatedFiles(
      index,
      adjacency,
      result.path,
      boost,
    )) {
      const current = graphScores.get(related.path) ?? {
        score: 0,
        relatedFiles: [],
      }
      current.score += related.score
      current.relatedFiles = mergeRelatedFiles(current.relatedFiles, [
        {
          path: result.path,
          score: related.score,
          reason: related.reason,
          via: related.via,
        },
      ])
      graphScores.set(related.path, current)
    }
  }
  return graphScores
}

function getRelatedFiles(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  filePath: string,
  boost: number,
): RelatedFile[] {
  const fileId = fileNodeId(filePath)
  const edges = adjacency.get(fileId) ?? []
  const related: RelatedFile[] = []

  for (const edge of edges) {
    const neighborNodeId = edge.from === fileId ? edge.to : edge.from
    const neighborNode = index.graph?.nodes[neighborNodeId]
    if (neighborNode?.type === 'file' && neighborNode.path) {
      if (!isNoisyFilePath(neighborNode.path)) {
        related.push({
          path: neighborNode.path,
          score: edge.weight * boost,
          reason: reasonForEdge(edge, edge.from === fileId),
          via: edge.label,
        })
      }
      continue
    }

    const secondHopEdges = (adjacency.get(neighborNodeId) ?? []).filter(
      (secondEdge) => !sameEdge(secondEdge, edge),
    )
    if (
      LOW_VALUE_RELATED_NODE_TYPES.has(neighborNode?.type ?? '') &&
      secondHopEdges.length > 12
    ) {
      continue
    }

    for (const secondEdge of secondHopEdges.slice(0, 40)) {
      const secondNeighborId =
        secondEdge.from === neighborNodeId ? secondEdge.to : secondEdge.from
      if (secondNeighborId === fileId) continue
      const secondNeighbor = index.graph?.nodes[secondNeighborId]
      if (
        secondNeighbor?.type !== 'file' ||
        !secondNeighbor.path ||
        isNoisyFilePath(secondNeighbor.path)
      )
        continue
      related.push({
        path: secondNeighbor.path,
        score: edge.weight * secondEdge.weight * boost * 0.6,
        reason: `shares ${neighborNode?.type ?? 'graph node'}`,
        via: neighborNode?.label ?? edge.label ?? secondEdge.label,
      })
    }
  }

  return mergeRelatedFiles([], related)
    .filter((item) => item.path !== filePath)
    .slice(0, MAX_RELATED_FILES_PER_RESULT)
}

function shortestFilePath(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  from: string,
  to: string,
): string[] {
  if (!index.files[from] || !index.files[to]) return []
  const queue: string[][] = [[fileNodeId(from)]]
  const seen = new Set<string>([fileNodeId(from)])

  // Use an index cursor instead of queue.shift() to avoid O(V^2) array
  // re-indexing on large graphs (shift re-indexes every remaining element).
  let head = 0
  while (head < queue.length) {
    const currentPath = queue[head++]
    const current = currentPath[currentPath.length - 1]
    if (current === fileNodeId(to)) {
      return currentPath
        .map((nodeId) => index.graph.nodes[nodeId])
        .filter((node) => node?.type === 'file' && node.path)
        .map((node) => node.path as string)
    }
    if (currentPath.length > 6) continue

    for (const edge of adjacency.get(current) ?? []) {
      const next = edge.from === current ? edge.to : edge.from
      const nextNode = index.graph.nodes[next]
      if (
        nextNode?.type === 'file' &&
        typeof nextNode.path === 'string' &&
        nextNode.path !== to &&
        isNoisyFilePath(nextNode.path)
      )
        continue
      if (seen.has(next)) continue
      seen.add(next)
      queue.push([...currentPath, next])
    }
  }

  return []
}

function findSeedPaths(
  index: MetadataIndex,
  tokens: string[],
  explicitPath?: string,
  fileTypes?: string[],
  // Default required by TS1016: this required param follows optional params
  // (explicitPath?, fileTypes?). All callers pass it explicitly.
  lexicalWeights: Required<LexicalWeights> = DEFAULT_LEXICAL_WEIGHTS,
  fallbackPath?: string,
): string[] {
  if (explicitPath && index.files[explicitPath]) return [explicitPath]
  if (fallbackPath && index.files[fallbackPath]) return [fallbackPath]
  const idf = computeIdfForTokens(index, tokens)
  const candidates = getPostingCandidates(index, tokens)
  const files = candidates
    ? Array.from(candidates, (filePath) => index.files[filePath]).filter(
        (file): file is IndexedFile => Boolean(file),
      )
    : Object.values(index.files)
  return files
    .filter((file) => matchesFileType(file, fileTypes))
    .map((file) => scoreFile(file, tokens, idf, false, lexicalWeights))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((result) => result.path)
}

/**
 * Find files that reference (import or call into) a seed file. P1-1 feature:
 * surfaces the blast radius of editing an exported symbol before the edit is
 * applied.
 *
 * Two edge types are consulted, with distinct reliability profiles:
 * - `references` edges are import-aware and reliable: they connect a file that
 *   imports a module to the resolved target file. These are the primary signal.
 * - `calls` edges are language/module-aware and refuse ambiguous raw-name
 *   ownership. They remain a secondary signal because static call resolution
 *   is conservative and cannot model every language's dynamic dispatch.
 *
 * The seed file path is taken from `options.from`, falling back to
 * `options.to`. If both are omitted, `findSeedPaths` resolves it from `query`
 * tokens (same path-seed resolution as `neighbors`).
 * Results are directional — only files that reference the seed are returned,
 * not files the seed references.
 */
function queryReferences(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  options: QueryOptions,
  lexicalWeights: Required<LexicalWeights>,
): QueryIndexResult[] {
  const seedPaths = findSeedPaths(
    index,
    tokens,
    options.from,
    options.fileTypes,
    lexicalWeights,
    options.to,
  )
  const results = new Map<string, QueryIndexResult>()
  // Track which seed paths have already been appended to each importer's
  // explanation, using exact-segment matching instead of substring checks.
  const explainedSeeds = new Map<string, Set<string>>()

  for (const seedPath of seedPaths) {
    const seedId = fileNodeId(seedPath)
    for (const edge of adjacency.get(seedId) ?? []) {
      // Only inbound edges point TO the seed from a referencing file.
      if (edge.to !== seedId) continue
      if (edge.type !== 'references' && edge.type !== 'calls') continue

      const importerNode = index.graph.nodes[edge.from]
      if (importerNode?.type !== 'file' || !importerNode.path) continue
      if (importerNode.path === seedPath) continue
      if (isNoisyFilePath(importerNode.path)) continue
      if (!matchesFileType(index.files[importerNode.path], options.fileTypes))
        continue

      const isReliable = edge.type === 'references'
      const file = index.files[importerNode.path]
      const existing = results.get(importerNode.path)
      const reason = isReliable
        ? `imports this file${edge.label ? ` (${edge.label})` : ''}`
        : `calls a symbol defined here${edge.label ? ` (${edge.label})` : ''} — statically resolved, verify dynamic dispatch before relying on it`
      if (existing) {
        existing.score += edge.weight
        existing.matchedOn = addMatchedOn(existing.matchedOn, 'graph')
        existing.relatedFiles = mergeRelatedFiles(existing.relatedFiles, [
          { path: seedPath, score: edge.weight, reason, via: edge.label },
        ])
        if (existing.explanation) {
          let seeds = explainedSeeds.get(importerNode.path)
          if (!seeds) {
            seeds = new Set<string>()
            explainedSeeds.set(importerNode.path, seeds)
          }
          if (!seeds.has(seedPath)) {
            seeds.add(seedPath)
            existing.explanation += `; also references ${seedPath}`
          }
        }
      } else {
        results.set(importerNode.path, {
          path: importerNode.path,
          score: edge.weight,
          matchedOn: ['graph'],
          symbols: file?.symbols.slice(0, 10),
          headings: file?.headings.slice(0, 5),
          relatedFiles: [
            { path: seedPath, score: edge.weight, reason, via: edge.label },
          ],
          explanation: `${importerNode.path} ${reason}`,
        })
      }
    }
  }

  return Array.from(results.values())
    .map((result) => ({ ...result, score: roundScore(result.score) }))
    .sort((a, b) => b.score - a.score)
}

function getAdjacency(index: MetadataIndex): GraphAdjacency {
  const cached = adjacencyCache.get(index)
  if (cached) return cached
  const adjacency = buildAdjacency(
    index.graph?.edges ?? [],
    index.queryData?.adjacency,
  )
  adjacencyCache.set(index, adjacency)
  return adjacency
}

function buildAdjacency(
  edges: IndexEdge[],
  persisted?: Record<string, number[]>,
): GraphAdjacency {
  const adjacency: GraphAdjacency = new Map()
  if (persisted) {
    for (const [nodeId, edgeIndexes] of Object.entries(persisted)) {
      const nodeEdges = edgeIndexes
        .map((edgeIndex) => edges[edgeIndex])
        .filter((edge): edge is IndexEdge => Boolean(edge))
      if (nodeEdges.length > 0) adjacency.set(nodeId, nodeEdges)
    }
    return adjacency
  }
  for (const edge of edges) {
    const fromEdges = adjacency.get(edge.from) ?? []
    fromEdges.push(edge)
    adjacency.set(edge.from, fromEdges)

    const toEdges = adjacency.get(edge.to) ?? []
    toEdges.push(edge)
    adjacency.set(edge.to, toEdges)
  }
  return adjacency
}

// Cache the normalized Set per fileTypes array reference to avoid
// O(files x fileTypes) allocations when called inside scoring loops.
const fileTypeSetCache = new WeakMap<string[], Set<string>>()

function matchesFileType(
  file: IndexedFile | undefined,
  fileTypes: string[] | undefined,
): boolean {
  if (!file) return false
  if (!fileTypes || fileTypes.length === 0) return true
  let normalizedFileTypes = fileTypeSetCache.get(fileTypes)
  if (!normalizedFileTypes) {
    normalizedFileTypes = new Set(fileTypes.map(normalizeFileType))
    fileTypeSetCache.set(fileTypes, normalizedFileTypes)
  }
  return normalizedFileTypes.has(normalizeFileType(file.ext))
}

function normalizeFileType(fileType: string): string {
  const normalized = fileType.trim().toLowerCase()
  return normalized.startsWith('.') ? normalized.slice(1) : normalized
}

function isNoisyPath(pathSegments: string[]): boolean {
  return pathSegments.some((segment) => NOISY_PATH_SEGMENTS.has(segment))
}

function isNoisyFilePath(filePath: string): boolean {
  return isNoisyPath(filePath.toLowerCase().replace(/\\/g, '/').split('/'))
}

function reasonForEdge(edge: IndexEdge, forward: boolean): string {
  if (edge.type === 'calls')
    return forward ? 'calls this file' : 'called by this file'
  if (edge.type === 'references')
    return forward ? 'references this file' : 'referenced by this file'
  if (edge.type === 'imports') return 'shares import dependency'
  if (edge.type === 'defines') return 'shares symbol relationship'
  if (edge.type === 'mentions') return 'shares documentation concept'
  if (edge.type === 'contains_heading') return 'shares documentation heading'
  return 'related in graph'
}

function sameEdge(a: IndexEdge, b: IndexEdge): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.type === b.type &&
    a.label === b.label
  )
}

function mergeRelatedFiles(
  current: RelatedFile[] | undefined,
  next: RelatedFile[],
): RelatedFile[] {
  const byPath = new Map<string, RelatedFile>()
  for (const item of [...(current ?? []), ...next]) {
    const existing = byPath.get(item.path)
    if (!existing || item.score > existing.score) {
      byPath.set(item.path, { ...item, score: roundScore(item.score) })
    }
  }
  return Array.from(byPath.values()).sort((a, b) => b.score - a.score)
}

function addMatchedOn(
  matchedOn: QueryIndexResult['matchedOn'],
  value: QueryIndexResult['matchedOn'][number],
): QueryIndexResult['matchedOn'] {
  return matchedOn.includes(value) ? matchedOn : [...matchedOn, value]
}

function explainResult(
  result: QueryIndexResult,
  staleness?: { ageMs: number; stale: boolean },
): string {
  const direct = result.matchedOn.join(', ') || 'no direct metadata match'
  const snippets = result.matchedSnippets?.length
    ? ` Snippets: ${result.matchedSnippets.join('; ')}.`
    : ''
  const related = result.relatedFiles?.length
    ? ` Related files: ${result.relatedFiles.map((item) => `${item.path} (${item.reason}${item.via ? ` via ${item.via}` : ''})`).join('; ')}.`
    : ''
  // Staleness note (M7.2): surfaced only in `mode: 'explain'` so the CLI can
  // report when an index is older than the freshness window (MAX_INDEX_AGE_MS).
  // Appended — never replaces — so existing explain rendering is preserved.
  const age = staleness
    ? ` Index age: ${Math.max(0, Math.round(staleness.ageMs / 1000))}s (${staleness.stale ? 'stale' : 'fresh'}).`
    : ''
  return `Matched on ${direct}.${snippets}${related}${age}`
}

function commandDiscoveryBoost(file: IndexedFile, tokens: string[]): number {
  let boost = 0
  if (isPackageJsonPath(file.path)) boost += 18
  if (isCiWorkflowPath(file.path)) boost += 16
  if (isTaskRunnerPath(file.path)) boost += 14
  if (isCommandDocsPath(file.path)) boost += 8

  for (const concept of file.concepts) {
    if (concept.startsWith('script:')) boost += 3
    if (
      concept.includes('validation suite') ||
      concept.includes('command configuration')
    )
      boost += 4
    if (tokens.some((token) => concept.includes(token))) boost += 2
  }
  for (const heading of file.headings) {
    const lower = heading.toLowerCase()
    if (
      Array.from(COMMAND_DISCOVERY_TOKENS).some((token) =>
        lower.includes(token),
      )
    )
      boost += 2
  }
  return boost
}

function commandMatchedSnippets(file: IndexedFile, tokens: string[]): string[] {
  const snippets: string[] = []
  for (const concept of file.concepts) {
    if (
      !concept.startsWith('script:') &&
      !concept.startsWith('run:') &&
      !concept.includes('validation suite')
    ) {
      continue
    }
    const normalized = concept.toLowerCase()
    if (
      tokens.length === 0 ||
      tokens.some((token) => normalized.includes(token)) ||
      (isPackageJsonPath(file.path) && concept.startsWith('script:'))
    ) {
      snippets.push(concept.replace(/^script:/, 'package script: '))
    }
  }
  if (snippets.length === 0 && isPackageJsonPath(file.path))
    snippets.push('package.json scripts')
  if (snippets.length === 0 && isCiWorkflowPath(file.path))
    snippets.push('CI workflow commands')
  return snippets.slice(0, 5)
}

function isCommandDiscoveryQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  return COMMAND_DISCOVERY_PHRASES.some((phrase) => normalized.includes(phrase))
}

function isCommandDiscoveryFile(file: IndexedFile): boolean {
  return (
    isPackageJsonPath(file.path) ||
    isCiWorkflowPath(file.path) ||
    isTaskRunnerPath(file.path) ||
    isCommandDocsPath(file.path) ||
    file.concepts.some(
      (concept) =>
        concept.startsWith('script:') ||
        concept.includes('command configuration'),
    )
  )
}

function isPackageJsonPath(filePath: string): boolean {
  return filePath.endsWith('package.json')
}

function isCiWorkflowPath(filePath: string): boolean {
  return (
    filePath.startsWith('.github/workflows/') ||
    filePath.includes('/.github/workflows/')
  )
}

function isTaskRunnerPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/')
  return (
    normalized.endsWith('makefile') ||
    normalized.endsWith('justfile') ||
    normalized.endsWith('turbo.json') ||
    normalized.endsWith('nx.json') ||
    normalized.endsWith('gulpfile.js') ||
    normalized.endsWith('gruntfile.js')
  )
}

function isCommandDocsPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/')
  return (
    normalized === 'contributing.md' ||
    normalized === 'docs/testing.md' ||
    normalized === 'docs/development.md' ||
    normalized.endsWith('/contributing.md') ||
    normalized.endsWith('/testing.md') ||
    normalized.endsWith('/development.md')
  )
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000
}

function fileNodeId(filePath: string): string {
  return `file:${filePath}`
}

function tokenizeQuery(query: string): string[] {
  const expanded = query
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  return expanded
    .toLowerCase()
    .split(/[\s\-_./\\:,;()|]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOP_WORDS.has(t))
    .slice(0, 20)
}

const COMMAND_DISCOVERY_PHRASES = [
  'validation suite',
  'what commands',
  'which commands',
  'run validation',
  'run tests',
  'run typecheck',
  'run lint',
  'run build',
  'before commit',
]

const COMMAND_DISCOVERY_TOKENS = new Set([
  'ci',
  'command',
  'commands',
  'lint',
  'script',
  'scripts',
  'typecheck',
  'verify',
])

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'has',
  'her',
  'was',
  'one',
  'our',
  'out',
  'had',
  'have',
  'him',
  'his',
  'how',
  'its',
  'may',
  'new',
  'now',
  'old',
  'see',
  'two',
  'who',
  'did',
  'get',
  'let',
  'too',
  'use',
  'way',
  'add',
  'any',
  'via',
  'per',
  'run',
])
