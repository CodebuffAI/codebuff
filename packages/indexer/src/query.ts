import type { IndexedFile, MetadataIndex, QueryIndexResult } from './types'

export interface QueryOptions {
  limit?: number
  fileTypes?: string[]
}

export function queryIndex(
  index: MetadataIndex,
  query: string,
  options: QueryOptions = {},
): QueryIndexResult[] {
  const { limit = 20, fileTypes } = options
  const tokens = tokenizeQuery(query)

  if (tokens.length === 0) {
    return Object.values(index.files)
      .slice(0, limit)
      .map((f) => ({ path: f.path, score: 0, matchedOn: [] }))
  }

  const results: QueryIndexResult[] = []

  for (const file of Object.values(index.files)) {
    if (fileTypes && fileTypes.length > 0) {
      const ext = file.ext.replace('.', '')
      if (!fileTypes.includes(ext)) continue
    }

    const result = scoreFile(file, tokens)
    if (result.score > 0) {
      results.push(result)
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function scoreFile(file: IndexedFile, tokens: string[]): QueryIndexResult {
  let score = 0
  const matchedOn = new Set<QueryIndexResult['matchedOn'][number]>()

  const normalizedPath = file.path.toLowerCase().replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/')
  const fileName = pathSegments[pathSegments.length - 1] ?? ''

  for (const token of tokens) {
    // File name match (strongest signal)
    if (fileName.includes(token)) {
      score += 5
      matchedOn.add('path')
    } else if (normalizedPath.includes(token)) {
      score += 2
      matchedOn.add('path')
    }

    // Symbol match
    for (const sym of file.symbols) {
      if (sym.toLowerCase().includes(token) || token.includes(sym.toLowerCase())) {
        score += 3
        matchedOn.add('symbol')
        break
      }
    }

    // Heading match
    for (const h of file.headings) {
      if (h.toLowerCase().includes(token)) {
        score += 2.5
        matchedOn.add('heading')
        break
      }
    }

    // Import match
    for (const imp of file.imports) {
      if (imp.toLowerCase().includes(token)) {
        score += 1
        matchedOn.add('import')
        break
      }
    }
  }

  // Slight depth penalty for very deeply nested files
  const depth = normalizedPath.split('/').length
  if (depth > 4) score *= Math.pow(0.95, depth - 4)

  return {
    path: file.path,
    score,
    matchedOn: Array.from(matchedOn),
    symbols: file.symbols.slice(0, 10),
    headings: file.headings.slice(0, 5),
  }
}

function tokenizeQuery(query: string): string[] {
  // Split camelCase/PascalCase before lowercasing
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
