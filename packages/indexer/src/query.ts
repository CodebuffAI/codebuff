import type {
  IndexedFile,
  IndexEdge,
  MetadataIndex,
  QueryIndexMode,
  QueryIndexResult,
  RelatedFile,
} from './types'

export interface QueryOptions {
  limit?: number
  fileTypes?: string[]
  mode?: QueryIndexMode
  from?: string
  to?: string
}

type GraphAdjacency = Map<string, IndexEdge[]>

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
    meanReciprocalRank: cases.length === 0
      ? 0
      : roundScore(reciprocalRankTotal / cases.length),
  }
}

export function queryIndex(
  index: MetadataIndex,
  query: string,
  options: QueryOptions = {},
): QueryIndexResult[] {
  const { limit = 20, fileTypes, mode = 'search' } = options
  const tokens = tokenizeQuery(query)
  const adjacency = buildAdjacency(index.graph?.edges ?? [])

  if (mode === 'neighbors') {
    return queryNeighbors(index, adjacency, tokens, options).slice(0, limit)
  }
  if (mode === 'path') {
    return queryPath(index, adjacency, tokens, options).slice(0, limit)
  }
  if (mode === 'explain') {
    return querySearch(index, adjacency, tokens, fileTypes, limit, true)
  }
  return querySearch(index, adjacency, tokens, fileTypes, limit, false)
}

function querySearch(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  fileTypes: string[] | undefined,
  limit: number,
  explain: boolean,
): QueryIndexResult[] {
  if (tokens.length === 0) {
    return Object.values(index.files)
      .filter((file) => matchesFileType(file, fileTypes))
      .slice(0, limit)
      .map((file) => ({ path: file.path, score: 0, matchedOn: [] }))
  }

  const directResults = new Map<string, QueryIndexResult>()

  for (const file of Object.values(index.files)) {
    if (!matchesFileType(file, fileTypes)) continue

    const result = scoreFile(file, tokens)
    if (result.score > 0) {
      directResults.set(file.path, result)
    }
  }

  const graphScores = scoreGraphNeighborhood(index, adjacency, directResults)
  for (const [path, related] of graphScores.entries()) {
    if (!matchesFileType(index.files[path], fileTypes)) continue
    const existing = directResults.get(path)
    if (existing) {
      existing.score += related.score
      existing.matchedOn = addMatchedOn(existing.matchedOn, 'graph')
      existing.relatedFiles = mergeRelatedFiles(existing.relatedFiles, related.relatedFiles)
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

  return Array.from(directResults.values())
    .map((result) => ({
      ...result,
      score: roundScore(result.score),
      relatedFiles: result.relatedFiles?.slice(0, MAX_RELATED_FILES_PER_RESULT),
      explanation: explain ? explainResult(result) : undefined,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function queryNeighbors(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  tokens: string[],
  options: QueryOptions,
): QueryIndexResult[] {
  const seedPaths = findSeedPaths(index, tokens, options.from, options.fileTypes)
  const related = new Map<string, QueryIndexResult>()
  for (const seedPath of seedPaths) {
    for (const item of getRelatedFiles(index, adjacency, seedPath, 2)) {
      if (item.path === seedPath || !matchesFileType(index.files[item.path], options.fileTypes)) continue
      const existing = related.get(item.path)
      if (existing) {
        existing.score += item.score
        existing.relatedFiles = mergeRelatedFiles(existing.relatedFiles, [{ ...item, path: seedPath }])
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
): QueryIndexResult[] {
  const from = options.from ?? findSeedPaths(index, tokens, undefined, options.fileTypes)[0]
  const to = options.to ?? findSeedPaths(index, tokens, undefined, options.fileTypes).find((path) => path !== from)
  if (!from || !to) return []

  const path = shortestFilePath(index, adjacency, from, to)
  if (path.length === 0) return []

  return path
    .filter((filePath) => matchesFileType(index.files[filePath], options.fileTypes))
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

function scoreFile(file: IndexedFile, tokens: string[]): QueryIndexResult {
  let score = 0
  const matchedOn = new Set<QueryIndexResult['matchedOn'][number]>()

  const normalizedPath = file.path.toLowerCase().replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/')
  const fileName = pathSegments[pathSegments.length - 1] ?? ''

  for (const token of tokens) {
    if (fileName.includes(token)) {
      score += 5
      matchedOn.add('path')
    } else if (normalizedPath.includes(token)) {
      score += 2
      matchedOn.add('path')
    }

    for (const sym of file.symbols) {
      if (sym.toLowerCase().includes(token) || token.includes(sym.toLowerCase())) {
        score += 3
        matchedOn.add('symbol')
        break
      }
    }

    for (const h of file.headings) {
      if (h.toLowerCase().includes(token)) {
        score += 2.5
        matchedOn.add('heading')
        break
      }
    }

    for (const concept of file.concepts) {
      if (concept.includes(token)) {
        score += 1.5
        matchedOn.add('concept')
        break
      }
    }

    for (const imp of file.imports) {
      if (imp.toLowerCase().includes(token)) {
        score += 1
        matchedOn.add('import')
        break
      }
    }
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
  }
}

function scoreGraphNeighborhood(
  index: MetadataIndex,
  adjacency: GraphAdjacency,
  directResults: Map<string, QueryIndexResult>,
): Map<string, { score: number; relatedFiles: RelatedFile[] }> {
  const graphScores = new Map<string, { score: number; relatedFiles: RelatedFile[] }>()
  const sortedDirectResults = Array.from(directResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)

  for (const result of sortedDirectResults) {
    const boost = Math.min(3, result.score / 4)
    for (const related of getRelatedFiles(index, adjacency, result.path, boost)) {
      const current = graphScores.get(related.path) ?? { score: 0, relatedFiles: [] }
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
      related.push({
        path: neighborNode.path,
        score: edge.weight * boost,
        reason: reasonForEdge(edge, edge.from === fileId),
        via: edge.label,
      })
      continue
    }

    const secondHopEdges = (adjacency.get(neighborNodeId) ?? [])
      .filter((secondEdge) => !sameEdge(secondEdge, edge))
    if (
      LOW_VALUE_RELATED_NODE_TYPES.has(neighborNode?.type ?? '') &&
      secondHopEdges.length > 12
    ) {
      continue
    }

    for (const secondEdge of secondHopEdges.slice(0, 40)) {
      const secondNeighborId = secondEdge.from === neighborNodeId ? secondEdge.to : secondEdge.from
      if (secondNeighborId === fileId) continue
      const secondNeighbor = index.graph.nodes[secondNeighborId]
      if (secondNeighbor?.type !== 'file' || !secondNeighbor.path) continue
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

  while (queue.length > 0) {
    const currentPath = queue.shift()
    if (!currentPath) break
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
): string[] {
  if (explicitPath && index.files[explicitPath]) return [explicitPath]
  return Object.values(index.files)
    .filter((file) => matchesFileType(file, fileTypes))
    .map((file) => scoreFile(file, tokens))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((result) => result.path)
}

function buildAdjacency(edges: IndexEdge[]): GraphAdjacency {
  const adjacency: GraphAdjacency = new Map()
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

function matchesFileType(file: IndexedFile | undefined, fileTypes: string[] | undefined): boolean {
  if (!file) return false
  if (!fileTypes || fileTypes.length === 0) return true
  const ext = file.ext.replace('.', '')
  return fileTypes.includes(ext)
}

function isNoisyPath(pathSegments: string[]): boolean {
  return pathSegments.some((segment) => NOISY_PATH_SEGMENTS.has(segment))
}

function reasonForEdge(edge: IndexEdge, forward: boolean): string {
  if (edge.type === 'calls') return forward ? 'calls this file' : 'called by this file'
  if (edge.type === 'references') return forward ? 'references this file' : 'referenced by this file'
  if (edge.type === 'imports') return 'shares import dependency'
  if (edge.type === 'defines') return 'shares symbol relationship'
  if (edge.type === 'mentions') return 'shares documentation concept'
  if (edge.type === 'contains_heading') return 'shares documentation heading'
  return 'related in graph'
}

function sameEdge(a: IndexEdge, b: IndexEdge): boolean {
  return a.from === b.from && a.to === b.to && a.type === b.type && a.label === b.label
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

function explainResult(result: QueryIndexResult): string {
  const direct = result.matchedOn.join(', ') || 'no direct metadata match'
  const related = result.relatedFiles?.length
    ? ` Related files: ${result.relatedFiles.map((item) => `${item.path} (${item.reason}${item.via ? ` via ${item.via}` : ''})`).join('; ')}.`
    : ''
  return `Matched on ${direct}.${related}`
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

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'has', 'her', 'was', 'one', 'our', 'out', 'had',
  'have', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
  'old', 'see', 'two', 'who', 'did', 'get', 'let', 'too',
  'use', 'way', 'add', 'any', 'via', 'per',
])
