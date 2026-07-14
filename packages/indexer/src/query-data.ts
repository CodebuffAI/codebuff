import type {
  IndexedFile,
  IndexGraph,
  IndexQueryData,
  MetadataIndex,
} from './types'

const MAX_POSTING_TOKEN_LENGTH = 160

/** Build deterministic, JSON-persistable query accelerators. */
export function buildIndexQueryData(
  files: Record<string, IndexedFile>,
  graph: IndexGraph,
): IndexQueryData {
  const postings = new Map<string, Set<string>>()

  for (const file of Object.values(files)) {
    for (const token of collectFilePostingTokens(file)) {
      let paths = postings.get(token)
      if (!paths) {
        paths = new Set()
        postings.set(token, paths)
      }
      paths.add(file.path)
    }
  }

  const persistedPostings: Record<string, string[]> = {}
  const documentFrequencies: Record<string, number> = {}
  for (const token of Array.from(postings.keys()).sort()) {
    const paths = Array.from(postings.get(token) ?? []).sort()
    persistedPostings[token] = paths
    documentFrequencies[token] = paths.length
  }

  const adjacency: Record<string, number[]> = {}
  graph.edges.forEach((edge, edgeIndex) => {
    ;(adjacency[edge.from] ??= []).push(edgeIndex)
    if (edge.to !== edge.from) (adjacency[edge.to] ??= []).push(edgeIndex)
  })

  return { postings: persistedPostings, documentFrequencies, adjacency }
}

/** Return the bounded union of posting lists that can satisfy query tokens. */
export function getPostingCandidates(
  index: MetadataIndex,
  queryTokens: string[],
): Set<string> | null {
  const postings = index.queryData?.postings
  if (!postings || queryTokens.length === 0) return null

  const candidates = new Set<string>()
  const postingTokens = Object.keys(postings)
  for (const rawToken of queryTokens) {
    const token = normalizePostingToken(rawToken)
    if (!token) continue
    const exact = postings[token]
    if (exact) for (const filePath of exact) candidates.add(filePath)

    // Preserve the historical substring matching contract without scanning
    // every file: scan the compact posting vocabulary and union its lists.
    for (const indexedToken of postingTokens) {
      if (
        indexedToken === token ||
        (!indexedToken.includes(token) &&
          !(indexedToken.length >= 4 && token.includes(indexedToken)))
      ) {
        continue
      }
      for (const filePath of postings[indexedToken]) candidates.add(filePath)
    }
  }
  return candidates
}

export function getPostingDocumentFrequency(
  index: MetadataIndex,
  token: string,
): number | undefined {
  const normalized = normalizePostingToken(token)
  if (!normalized || !index.queryData) return undefined
  const exact = index.queryData.documentFrequencies[normalized]
  if (exact !== undefined) return exact
  return getPostingCandidates(index, [normalized])?.size
}

export function collectFilePostingTokens(file: IndexedFile): Set<string> {
  const tokens = new Set<string>()
  const values = [
    file.path,
    ...file.symbols,
    ...file.headings,
    ...file.concepts,
    ...file.imports,
  ]
  for (const value of values) {
    for (const token of tokenizePostingValue(value)) tokens.add(token)
  }
  return tokens
}

function tokenizePostingValue(value: string): string[] {
  const camelSeparated = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const parts = camelSeparated
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map(normalizePostingToken)
    .filter((token): token is string => Boolean(token))
  const compact = normalizePostingToken(value)
  return compact && !parts.includes(compact) ? [compact, ...parts] : parts
}

function normalizePostingToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, MAX_POSTING_TOKEN_LENGTH)
}
